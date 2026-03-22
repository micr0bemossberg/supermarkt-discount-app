import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiConfig, ImageChunk, ExtractionContext, ExtractionResult } from './types';
import { PRODUCT_EXTRACTION_SCHEMA } from './types';
import { KeyPool } from './keyPool';
import { buildExtractionPrompt } from './prompt';
import { parseGeminiResponse } from './responseParser';
import { createLogger } from '../utils/logger';

const logger = createLogger('GeminiExtractor');

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GeminiExtractor — async while-loop dispatcher with global pacing.
 *
 * CHANGES from previous setInterval version:
 * 1. ASYNC WHILE-LOOP: Replaces setInterval(100ms) polling. More efficient,
 *    no race conditions, precise control over dispatch timing.
 * 2. GLOBAL PACING: 150ms delay between each dispatched request (max ~6.6 req/s).
 *    Prevents IP-based burst blocking from Google's WAF.
 * 3. SINGLE MODEL: Lite-only by default (Flash removed from KeyPool).
 *    60 keys × 1 model = 60 slots (was 120 with 2 models).
 *    Flash's 20 RPD was exhausting quickly and generating 429 noise.
 * 4. SUCCESS COOLDOWN: KeyPool.markFree() now applies 4.1s cooldown
 *    (15 RPM = 1 per 4s). Key won't be reused immediately after success.
 *
 * Flow:
 *   while (queue has items OR slots in-flight):
 *     if (free slot AND chunk in queue):
 *       dispatch chunk → slot IN-FLIGHT
 *       await delay(150ms)  ← global pacing
 *     else:
 *       await delay(50ms)   ← idle wait
 */
export class GeminiExtractor {
  private config: GeminiConfig;
  private keyPool: KeyPool;

  constructor(config: GeminiConfig) {
    this.config = config;
    this.keyPool = new KeyPool(config.apiKeys);
  }

  async extractProducts(
    images: ImageChunk[],
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    const extractionStart = Date.now();
    const prompt = buildExtractionPrompt(context);
    let totalTokens = 0;
    const allProducts: import('@supermarkt-deals/shared').ScrapedProduct[] = [];
    const keyUsage = new Map<number, { calls: number; errors: number }>();

    const activeKeys = this.keyPool.totalActiveKeys();
    logger.info(`Processing ${images.length} chunks across ${activeKeys} keys`);

    const queue: ImageChunk[] = [...images];
    let completed = 0;
    let permanentlyFailed = 0;
    let lastLogTime = Date.now();

    // Global pacing: min delay between dispatching consecutive requests
    // ~6.6 req/s max across all keys — stays under Google's IP burst limiter
    const GLOBAL_DISPATCH_DELAY_MS = 150;

    // Async while-loop dispatcher (replaces setInterval)
    while (queue.length > 0 || this.keyPool.hasInFlight()) {
      // All keys disabled? Abort.
      if (this.keyPool.totalActiveKeys() === 0) {
        logger.warning('All keys disabled — aborting');
        permanentlyFailed += queue.length;
        queue.length = 0;
        break;
      }

      // Log status every 5s
      if (Date.now() - lastLogTime >= 5000) {
        this.keyPool.logStatus();
        logger.info(`Queue: ${queue.length} | Completed: ${completed}/${images.length} | Products: ${allProducts.length}`);
        lastLogTime = Date.now();
      }

      const freeSlots = this.keyPool.getFreeSlots();

      if (queue.length > 0 && freeSlots.length > 0) {
        // Dispatch ONE chunk to ONE free slot
        const chunk = queue.shift()!;
        const { key, model, slotIndex } = freeSlots[0];

        this.keyPool.markInFlight(slotIndex);
        if (!keyUsage.has(slotIndex)) keyUsage.set(slotIndex, { calls: 0, errors: 0 });

        // Fire-and-forget — result handled async
        this.callGemini(chunk, prompt, key, model).then(
          (result) => {
            this.keyPool.markFree(slotIndex); // 4.1s success cooldown
            allProducts.push(...result.products);
            totalTokens += result.tokens;
            keyUsage.get(slotIndex)!.calls++;
            completed++;
            if (completed % 10 === 0) {
              logger.info(`${completed}/${images.length} done (${allProducts.length} products, ${queue.length} queued)`);
            }
          },
          (error) => {
            const msg = error instanceof Error ? error.message : String(error);
            keyUsage.get(slotIndex)!.errors++;

            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
              this.keyPool.markRateLimited(slotIndex); // Escalating backoff
              queue.push(chunk); // Back in queue
            } else if (msg.includes('API_KEY_INVALID')) {
              logger.warning(`Slot ${slotIndex} invalid key — disabling`);
              this.keyPool.disableKey(key);
              queue.push(chunk);
            } else {
              this.keyPool.markFree(slotIndex);
              permanentlyFailed++;
              logger.warning(`Chunk ${chunk.index + 1} permanently failed: ${msg.substring(0, 200)}`);
            }
          },
        );

        // Global pacing — wait before dispatching next request
        await delay(GLOBAL_DISPATCH_DELAY_MS);
      } else {
        // No free slots or empty queue — idle wait
        await delay(50);
      }
    }

    // Log summary
    const keyStats = [...keyUsage.entries()]
      .sort(([a], [b]) => a - b)
      .map(([k, v]) => `slot${k}:${v.calls}ok/${v.errors}err`)
      .join(', ');
    logger.info(`Slot usage: ${keyStats}`);

    const beforeDedup = allProducts.length;
    const deduped = this.deduplicateProducts(allProducts);

    const totalMs = Date.now() - extractionStart;
    logger.info(`Extraction complete: ${deduped.length} products (${beforeDedup - deduped.length} dupes removed), ${totalTokens} tokens, ${Math.round(totalMs / 1000)}s total`);

    return {
      products: deduped,
      chunksProcessed: images.length - permanentlyFailed,
      chunksFailed: permanentlyFailed,
      tokensUsed: totalTokens,
    };
  }

  private deduplicateProducts(products: import('@supermarkt-deals/shared').ScrapedProduct[]): import('@supermarkt-deals/shared').ScrapedProduct[] {
    const seen = new Map<string, import('@supermarkt-deals/shared').ScrapedProduct>();
    for (const p of products) {
      const key = `${p.title.toLowerCase().trim()}|${p.discount_price}`;
      if (!seen.has(key)) {
        seen.set(key, p);
      } else {
        const existing = seen.get(key)!;
        const existingScore = (existing.original_price ? 1 : 0) + (existing.description ? 1 : 0) + (existing.unit_info ? 1 : 0);
        const newScore = (p.original_price ? 1 : 0) + (p.description ? 1 : 0) + (p.unit_info ? 1 : 0);
        if (newScore > existingScore) seen.set(key, p);
      }
    }
    return [...seen.values()];
  }

  private async callGemini(
    chunk: ImageChunk,
    prompt: string,
    apiKey: string,
    modelId: string,
  ): Promise<{ products: import('@supermarkt-deals/shared').ScrapedProduct[]; tokens: number }> {
    // 120s timeout — prevents hung Gemini calls from blocking the dispatcher
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini call timed out after 120s')), 120_000)
    );
    return Promise.race([this._callGeminiImpl(chunk, prompt, apiKey, modelId), timeout]);
  }

  private async _callGeminiImpl(
    chunk: ImageChunk,
    prompt: string,
    apiKey: string,
    modelId: string,
  ): Promise<{ products: import('@supermarkt-deals/shared').ScrapedProduct[]; tokens: number }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig: Record<string, unknown> = {
      temperature: this.config.temperature,
      mediaResolution: this.config.mediaResolution,
    };
    if (this.config.useStructuredOutput) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = PRODUCT_EXTRACTION_SCHEMA;
    }
    if (this.config.thinkingLevel !== 'minimal') {
      generationConfig.thinkingConfig = {
        thinkingLevel: this.config.thinkingLevel.toUpperCase(),
      };
    }
    const model = genAI.getGenerativeModel({
      model: modelId,
      generationConfig,
      systemInstruction: 'You are a Dutch supermarket discount data extractor. Extract ALL discount/deal products visible in the provided image. Be thorough — do not skip any products.',
    });
    const imagePart = {
      inlineData: {
        data: chunk.buffer.toString('base64'),
        mimeType: 'image/png' as const,
      },
    };
    const contextLine = `[Image ${chunk.index + 1} of ${chunk.totalChunks}]`;
    const result = await model.generateContent([contextLine + '\n' + prompt, imagePart]);
    const text = result.response.text();
    const tokens = result.response.usageMetadata?.totalTokenCount ?? 0;
    return { products: parseGeminiResponse(text), tokens };
  }
}
