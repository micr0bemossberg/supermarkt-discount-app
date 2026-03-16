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

    // 10 keys on 10 separate projects = 10 × 15 RPM = 150 RPM total.
    // Process in batches of maxConcurrent (10), with a short stagger delay
    // between batches to stay safely under each project's 15 RPM limit.
    // 10 chunks/batch × 6 batches/min = 60 RPM (safe margin under 150).
    const batchSize = Math.min(this.config.maxConcurrent, images.length);
    const totalBatches = Math.ceil(images.length / batchSize);

    logger.info(`Processing ${images.length} chunks in ${totalBatches} batches of ${batchSize} (${this.keyPool.availableCount()} keys available)`);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * batchSize;
      const batch = images.slice(batchStart, batchStart + batchSize);

      // Process batch concurrently — each chunk gets a different key via key pool
      await Promise.allSettled(
        batch.map(async (chunk) => {
          try {
            const result = await this.extractFromChunk(chunk, prompt);
            totalTokens += result.tokens;
            allProducts.push(...result.products);
          } catch (error) {
            chunksFailed++;
            logger.warning(
              `Chunk ${chunk.index + 1}/${chunk.totalChunks} failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        })
      );

      // Short delay between batches to avoid bursting any single project
      if (batchIdx < totalBatches - 1) {
        const delayMs = this.config.batchDelayMs;
        logger.info(`Batch ${batchIdx + 1}/${totalBatches} complete (${allProducts.length} products so far), next batch in ${delayMs / 1000}s`);
        await this.sleep(delayMs);
      }
    }

    return {
      products: allProducts,
      chunksProcessed: images.length - chunksFailed,
      chunksFailed,
      tokensUsed: totalTokens,
    };
  }

  private async extractFromChunk(
    chunk: ImageChunk,
    prompt: string,
  ): Promise<{ products: import('@supermarkt-deals/shared').ScrapedProduct[]; tokens: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      const apiKey = this.keyPool.getNextKey();
      if (!apiKey) {
        // All keys on cooldown — wait for shortest cooldown to expire
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
          logger.warning('API key expired/invalid, disabling and trying next key');
          this.keyPool.cooldownKey(apiKey, 24 * 60 * 60 * 1000);
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
