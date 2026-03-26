import type { ScrapedProduct } from '@supermarkt-deals/shared';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';
export type MediaResolution = 'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH';

export interface GeminiConfig {
  apiKeys: string[];
  modelId: string;
  maxConcurrent: number;
  retryAttempts: number;
  temperature: number;
  thinkingLevel: ThinkingLevel;
  mediaResolution: MediaResolution;
  useStructuredOutput: boolean;
  batchDelayMs: number;            // Delay between batches to respect rate limits
}

export interface ImageChunk {
  buffer: Buffer;
  index: number;
  totalChunks: number;
  _useFallbackModel?: boolean;  // Set by dispatcher on 503 — retry with gemini-3-flash-preview
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
  maxConcurrent: 10,                        // Match number of active keys
  retryAttempts: 2,
  temperature: 0.0,               // Deterministic — no creativity needed for data extraction
  thinkingLevel: 'high',          // Free tier — max reasoning for best extraction accuracy
  mediaResolution: 'MEDIA_RESOLUTION_HIGH', // 1120 tokens/image — needed to read small print prices
  useStructuredOutput: true,      // Force valid JSON via responseSchema
  batchDelayMs: 0,                // No delay — natural API latency (~3s) spaces out key reuse automatically
};

/**
 * JSON Schema for structured output enforcement.
 * Gemini will guarantee the response matches this schema exactly.
 */
/**
 * Gemini API uses its own schema format (not standard JSON Schema).
 * - Types are UPPERCASE: STRING, NUMBER, INTEGER, BOOLEAN, OBJECT, ARRAY
 * - Nullable via `nullable: true` (not type arrays)
 * - `description` fields guide the model's extraction
 */
export const PRODUCT_EXTRACTION_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'Product name in Dutch as shown on the image' },
      discount_price: { type: 'NUMBER', description: 'Discounted sale price in EUR (e.g., 1.99)' },
      original_price: { type: 'NUMBER', description: 'Original price before discount, if visible', nullable: true },
      discount_percentage: { type: 'INTEGER', description: 'Discount percentage 0-100, if shown on a badge', nullable: true },
      description: { type: 'STRING', description: 'Product subtitle or variant info', nullable: true },
      unit_info: { type: 'STRING', description: 'Unit/quantity info: "per kg", "per stuk", "2 voor €3"', nullable: true },
      valid_from: { type: 'STRING', description: 'Discount start date as YYYY-MM-DD, if visible', nullable: true },
      valid_until: { type: 'STRING', description: 'Discount end date as YYYY-MM-DD, if visible', nullable: true },
      category_slug: { type: 'STRING', description: 'Product category slug from the provided list', nullable: true },
      requires_card: { type: 'BOOLEAN', description: 'True if loyalty card badge visible (Bonuskaart, Extra\'s)' },
      image_url: { type: 'STRING', description: 'Product image URL, only if visible in the image', nullable: true },
      product_url: { type: 'STRING', description: 'Product page URL, only if visible in the image', nullable: true },
      deal_type: {
        type: 'STRING',
        description: 'Type of deal/promotion. One of: korting, 1+1_gratis, 2+1_gratis, 2e_halve_prijs, x_voor_y, weekend_actie, dag_actie, bonus, extra, stunt, combinatie_korting, gratis_bijproduct, overig',
        nullable: true,
      },
    },
    required: ['title', 'discount_price', 'requires_card'],
  },
};
