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
  temperature: 0.0,               // Deterministic — no creativity needed for data extraction
  thinkingLevel: 'high',          // Max reasoning — model is free, no cost concern
  mediaResolution: 'MEDIA_RESOLUTION_HIGH', // 1120 tokens/image — needed to read small print prices
  useStructuredOutput: true,      // Force valid JSON via responseSchema
};

/**
 * JSON Schema for structured output enforcement.
 * Gemini will guarantee the response matches this schema exactly.
 */
export const PRODUCT_EXTRACTION_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Product name in Dutch as shown on the image' },
      discount_price: { type: 'number', description: 'Discounted sale price in EUR (e.g., 1.99)' },
      original_price: { type: ['number', 'null'], description: 'Original price before discount, if visible' },
      discount_percentage: { type: ['integer', 'null'], description: 'Discount percentage 0-100, if shown on a badge' },
      description: { type: ['string', 'null'], description: 'Product subtitle or variant info' },
      unit_info: { type: ['string', 'null'], description: 'Unit/quantity info: "per kg", "per stuk", "2 voor €3"' },
      valid_from: { type: ['string', 'null'], description: 'Discount start date as YYYY-MM-DD, if visible', format: 'date' },
      valid_until: { type: ['string', 'null'], description: 'Discount end date as YYYY-MM-DD, if visible', format: 'date' },
      category_slug: { type: ['string', 'null'], description: 'Product category slug from the provided list' },
      requires_card: { type: 'boolean', description: 'True if loyalty card badge visible (Bonuskaart, Extra\'s)' },
      image_url: { type: ['string', 'null'], description: 'Product image URL, only if visible in the image' },
      product_url: { type: ['string', 'null'], description: 'Product page URL, only if visible in the image' },
    },
    required: ['title', 'discount_price', 'requires_card'],
  },
};
