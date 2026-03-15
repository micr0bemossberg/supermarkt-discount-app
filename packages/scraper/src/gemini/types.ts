import type { ScrapedProduct } from '@supermarkt-deals/shared';

export interface GeminiConfig {
  apiKeys: string[];
  modelId: string;
  maxConcurrent: number;
  retryAttempts: number;
  temperature: number;
}

export interface ImageChunk {
  buffer: Buffer;
  index: number;
  totalChunks: number;
}

export interface ExtractionContext {
  supermarketSlug: string;
  supermarketName: string;
  categorySlugList: string[];
  promptHints?: string;
}

export interface ExtractionResult {
  products: ScrapedProduct[];
  chunksProcessed: number;
  chunksFailed: number;
  tokensUsed: number;
}

export interface KeyState {
  key: string;
  cooldownUntil: number; // timestamp ms, 0 = available
}

export const GEMINI_DEFAULTS: GeminiConfig = {
  apiKeys: [],
  modelId: 'gemini-3.1-flash-lite-preview',
  maxConcurrent: 10,
  retryAttempts: 2,
  temperature: 0.1,
};
