import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiConfig, ImageChunk, ExtractionContext, ExtractionResult } from './types';
import { PRODUCT_EXTRACTION_SCHEMA } from './types';
import { KeyPool } from './keyPool';
import { buildExtractionPrompt } from './prompt';
import { parseGeminiResponse } from './responseParser';
import { createLogger } from '../utils/logger';

const logger = createLogger('GeminiExtractor');

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

    const activeKeys = this.keyPool.totalActiveKeys();
    logger.info(`Processing ${images.length} chunks across ${activeKeys} keys`);

    // Track per-key usage for diagnostics
    const keyUsage = new Map<number, { calls: number; errors: number }>();

    // Process with retries — failed chunks go back in the queue
    let queue = [...images];
    let permanentlyFailed = 0;
    const maxRounds = 4; // 1 initial + 3 retries

    for (let round = 0; round < maxRounds && queue.length > 0; round++) {
      const roundStart = Date.now();
      const failedThisRound: ImageChunk[] = [];
      let completed = 0;

      // Fire all chunks — each waits for a free key (polls every 100ms)
      const tasks = queue.map((chunk) => this.processChunk(chunk, prompt, keyUsage, failedThisRound, allProducts, {
        totalTokens: { value: 0 },
        onComplete: (tokens) => {
          totalTokens += tokens;
          completed++;
          if (completed % 10 === 0 || completed === queue.length) {
            logger.info(`Round ${round + 1}: ${completed}/${queue.length} done (${allProducts.length} products)`);
          }
        },
      }));

      await Promise.allSettled(tasks);
      const roundMs = Date.now() - roundStart;
      logger.info(`Round ${round + 1} completed: ${completed} ok, ${failedThisRound.length} failed in ${Math.round(roundMs / 1000)}s`);

      if (failedThisRound.length === 0) break;

      if (round < maxRounds - 1) {
        queue = failedThisRound;
        logger.info(`Retrying ${queue.length} failed chunks (round ${round + 2}/${maxRounds})`);
      } else {
        permanentlyFailed += failedThisRound.length;
        logger.warning(`${failedThisRound.length} chunks failed after all retry rounds`);
      }
    }

    // Log key usage summary
    const keyStats = [...keyUsage.entries()]
      .sort(([a], [b]) => a - b)
      .map(([k, v]) => `key${k}:${v.calls}ok/${v.errors}err`)
      .join(', ');
    logger.info(`Key usage: ${keyStats}`);

    // Cross-chunk dedup
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

  /**
   * Process a single chunk: wait for free key → call Gemini → release key.
   * On 429: cooldown key, push to failedThisRound.
   * On auth error: disable key, push to failedThisRound.
   * On other error: permanently failed.
   */
  private async processChunk(
    chunk: ImageChunk,
    prompt: string,
    keyUsage: Map<number, { calls: number; errors: number }>,
    failedThisRound: ImageChunk[],
    allProducts: import('@supermarkt-deals/shared').ScrapedProduct[],
    ctx: { totalTokens: { value: number }; onComplete: (tokens: number) => void },
  ): Promise<void> {
    const { key, keyIndex } = await this.keyPool.waitForKey();
    if (!keyUsage.has(keyIndex)) keyUsage.set(keyIndex, { calls: 0, errors: 0 });

    try {
      const result = await this.callGemini(chunk, prompt, key);
      this.keyPool.releaseKey(key);
      allProducts.push(...result.products);
      keyUsage.get(keyIndex)!.calls++;
      ctx.onComplete(result.tokens);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      keyUsage.get(keyIndex)!.errors++;

      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        const waitMs = this.parseCooldownMs(error) || 10000;
        logger.warning(`Chunk ${chunk.index + 1} rate-limited (key${keyIndex}) — wait ${Math.round(waitMs / 1000)}s, back in queue`);
        this.keyPool.cooldownKey(key, waitMs);
        failedThisRound.push(chunk);
      } else if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('403')) {
        logger.warning(`Chunk ${chunk.index + 1} auth error — disabling key${keyIndex}`);
        this.keyPool.disableKey(key);
        failedThisRound.push(chunk);
      } else {
        this.keyPool.releaseKey(key);
        logger.warning(`Chunk ${chunk.index + 1} permanently failed: ${msg.substring(0, 200)}`);
      }
    }
  }

  /**
   * Deduplicate products from overlapping screenshot chunks.
   */
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
        if (newScore > existingScore) {
          seen.set(key, p);
        }
      }
    }

    return [...seen.values()];
  }

  /**
   * Single Gemini API call — no retries here. Caller handles failures.
   */
  private async callGemini(
    chunk: ImageChunk,
    prompt: string,
    apiKey: string,
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
      model: this.config.modelId,
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

  private parseCooldownMs(error: unknown): number | null {
    if (error instanceof Error) {
      const retryMatch = error.message.match(/"retryDelay":"(\d+)s"/);
      if (retryMatch) return parseInt(retryMatch[1]) * 1000;
      const secondsMatch = error.message.match(/(\d+)\s*seconds?/i);
      if (secondsMatch) return parseInt(secondsMatch[1]) * 1000;
    }
    return null;
  }
}
