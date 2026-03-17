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
    let chunksFailed = 0;
    const allProducts: import('@supermarkt-deals/shared').ScrapedProduct[] = [];

    // Key dispatcher: each chunk waits for an available key, then fires.
    // The key pool tracks per-key RPM intervals (4s for 15 RPM).
    // No batches, no artificial delays — the pool itself is the rate limiter.
    // With 10 keys × 15 RPM, max throughput = 150 RPM (~2.5 req/s).
    const activeKeys = this.keyPool.totalActiveKeys();
    logger.info(`Processing ${images.length} chunks across ${activeKeys} keys (max ${activeKeys * 15} RPM)`);

    // Use p-limit to cap in-flight requests to number of keys
    const pLimitModule = require('p-limit');
    const pLimit = pLimitModule.default || pLimitModule;
    const limit = pLimit(activeKeys);

    let completed = 0;
    const tasks = images.map((chunk) =>
      limit(async () => {
        // Wait for a key that's ready (respects per-key RPM interval)
        const key = await this.keyPool.waitForKey();

        try {
          const result = await this.extractFromChunkWithKey(chunk, prompt, key);
          totalTokens += result.tokens;
          allProducts.push(...result.products);
          completed++;
          if (completed % 10 === 0) {
            logger.info(`Progress: ${completed}/${images.length} chunks done (${allProducts.length} products)`);
          }
        } catch (error) {
          chunksFailed++;
          logger.warning(
            `Chunk ${chunk.index + 1}/${chunk.totalChunks} failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    await Promise.allSettled(tasks);

    return {
      products: allProducts,
      chunksProcessed: images.length - chunksFailed,
      chunksFailed,
      tokensUsed: totalTokens,
    };
  }

  private async extractFromChunkWithKey(
    chunk: ImageChunk,
    prompt: string,
    assignedKey: string,
  ): Promise<{ products: import('@supermarkt-deals/shared').ScrapedProduct[]; tokens: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      // Use assigned key on first attempt, rotate on retries
      const apiKey = attempt === 0 ? assignedKey : this.keyPool.getNextKey();
      if (!apiKey) {
        logger.warning('All API keys on cooldown, waiting 10s...');
        await this.sleep(10000);
        continue;
      }

      try {
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

        const products = parseGeminiResponse(text);
        return { products, tokens };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.isRateLimitError(error)) {
          // Parse actual retry delay from error, or use 10s default
          const cooldownMs = this.parseCooldownMs(error) || 10000;
          logger.warning(`Key rate-limited, cooling down ${Math.round(cooldownMs / 1000)}s`);
          this.keyPool.cooldownKey(apiKey, cooldownMs);
          continue; // Try next key immediately
        }

        if (this.isAuthError(error)) {
          logger.warning('API key expired/invalid, permanently disabling');
          this.keyPool.disableKey(apiKey);
          continue;
        }

        // Other errors — exponential backoff
        await this.sleep(2000 * Math.pow(2, attempt));
      }
    }

    throw lastError ?? new Error('Extraction failed after all retries');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED');
    }
    return false;
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('401') || error.message.includes('403') ||
             error.message.includes('API_KEY_INVALID');
    }
    return false;
  }

  private parseCooldownMs(error: unknown): number | null {
    if (error instanceof Error) {
      const secondsMatch = error.message.match(/(\d+)\s*seconds?/i);
      if (secondsMatch) return parseInt(secondsMatch[1]) * 1000;

      const msMatch = error.message.match(/(\d+)\s*ms/i);
      if (msMatch) return parseInt(msMatch[1]);

      // Parse "retryDelay":"35s" from JSON in error message
      const retryDelayMatch = error.message.match(/"retryDelay":"(\d+)s"/);
      if (retryDelayMatch) return parseInt(retryDelayMatch[1]) * 1000;
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
