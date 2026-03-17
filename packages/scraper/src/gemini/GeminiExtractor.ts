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
    const prompt = buildExtractionPrompt(context);
    let totalTokens = 0;
    const allProducts: import('@supermarkt-deals/shared').ScrapedProduct[] = [];

    const activeKeys = this.keyPool.totalActiveKeys();
    logger.info(`Processing ${images.length} chunks across ${activeKeys} keys`);

    // Use p-limit to cap concurrency to number of active keys
    const pLimitModule = require('p-limit');
    const pLimit = pLimitModule.default || pLimitModule;
    const limit = pLimit(activeKeys);

    // Process with retries — failed chunks go back in the queue
    let queue = [...images];
    let permanentlyFailed = 0;
    const maxRounds = 4; // 1 initial + 3 retries

    for (let round = 0; round < maxRounds && queue.length > 0; round++) {
      const failedThisRound: ImageChunk[] = [];
      let completed = 0;

      const tasks = queue.map((chunk) =>
        limit(async () => {
          const key = await this.keyPool.waitForKey();

          try {
            const result = await this.callGemini(chunk, prompt, key);
            totalTokens += result.tokens;
            allProducts.push(...result.products);
            completed++;
            if (completed % 10 === 0 || completed === queue.length) {
              logger.info(`Round ${round + 1}: ${completed}/${queue.length} done (${allProducts.length} products)`);
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);

            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
              // Rate limited — parse Google's retry delay and cooldown this key
              const cooldownMs = this.parseCooldownMs(error) || 10000;
              this.keyPool.cooldownKey(key, cooldownMs);
              failedThisRound.push(chunk); // Retry later
            } else if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('403')) {
              this.keyPool.disableKey(key);
              failedThisRound.push(chunk); // Retry with different key
            } else {
              // Unknown error — don't retry
              permanentlyFailed++;
              logger.warning(`Chunk ${chunk.index + 1} permanently failed: ${msg}`);
            }
          }
        })
      );

      await Promise.allSettled(tasks);

      if (failedThisRound.length === 0) break;

      if (round < maxRounds - 1) {
        logger.info(`Retrying ${failedThisRound.length} failed chunks (round ${round + 2}/${maxRounds})...`);
        queue = failedThisRound;
        // Wait for all cooldowns to expire before retrying
        await new Promise<void>(async (resolve) => {
          while (this.keyPool.availableCount() === 0) {
            await new Promise((r) => setTimeout(r, 2000));
          }
          resolve();
        });
      } else {
        permanentlyFailed += failedThisRound.length;
        logger.warning(`${failedThisRound.length} chunks failed after all retry rounds`);
      }
    }

    return {
      products: allProducts,
      chunksProcessed: images.length - permanentlyFailed,
      chunksFailed: permanentlyFailed,
      tokensUsed: totalTokens,
    };
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
      // "retryDelay":"35s" from Google's error JSON
      const retryMatch = error.message.match(/"retryDelay":"(\d+)s"/);
      if (retryMatch) return parseInt(retryMatch[1]) * 1000;

      const secondsMatch = error.message.match(/(\d+)\s*seconds?/i);
      if (secondsMatch) return parseInt(secondsMatch[1]) * 1000;
    }
    return null;
  }
}
