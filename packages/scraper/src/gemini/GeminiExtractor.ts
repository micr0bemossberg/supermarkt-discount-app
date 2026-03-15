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

    // Process in batches to respect rate limits.
    // Free tier: 15 RPM per project (shared across all keys).
    // Process up to maxConcurrent chunks per batch, then wait.
    const batchSize = Math.min(this.config.maxConcurrent, images.length);
    const totalBatches = Math.ceil(images.length / batchSize);

    logger.info(`Processing ${images.length} chunks in ${totalBatches} batches of ${batchSize}`);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * batchSize;
      const batch = images.slice(batchStart, batchStart + batchSize);

      // Process batch concurrently
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

      // Rate limit delay between batches (not after last batch)
      if (batchIdx < totalBatches - 1) {
        const delayMs = this.config.batchDelayMs;
        logger.info(`Batch ${batchIdx + 1}/${totalBatches} done, waiting ${delayMs / 1000}s for rate limit...`);
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
        // All keys on cooldown — wait and retry
        await this.sleep(2000 * (attempt + 1));
        continue;
      }

      try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Build generation config with all features
        const generationConfig: Record<string, unknown> = {
          temperature: this.config.temperature,
          mediaResolution: this.config.mediaResolution,
        };

        // Structured output: force Gemini to return valid JSON matching our schema
        if (this.config.useStructuredOutput) {
          generationConfig.responseMimeType = 'application/json';
          generationConfig.responseSchema = PRODUCT_EXTRACTION_SCHEMA;
        }

        // Thinking: enable step-by-step reasoning for price/date extraction
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

        // Rate limit — cooldown this key
        if (this.isRateLimitError(error)) {
          const cooldownMs = this.parseCooldownMs(error) || 5000 * (attempt + 1);
          this.keyPool.cooldownKey(apiKey, cooldownMs);
          continue;
        }

        // Auth error — permanently disable this key and try next
        if (this.isAuthError(error)) {
          logger.warning(`API key expired/invalid, disabling and trying next key`);
          this.keyPool.cooldownKey(apiKey, 24 * 60 * 60 * 1000); // 24h cooldown
          continue;
        }

        // Retryable — exponential backoff
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
      // Parse "retry after X seconds" from error message
      const secondsMatch = error.message.match(/(\d+)\s*seconds?/i);
      if (secondsMatch) return parseInt(secondsMatch[1]) * 1000;

      const msMatch = error.message.match(/(\d+)\s*ms/i);
      if (msMatch) return parseInt(msMatch[1]);
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
