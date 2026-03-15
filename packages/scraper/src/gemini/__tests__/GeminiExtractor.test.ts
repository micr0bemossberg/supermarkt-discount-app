import { GeminiExtractor } from '../GeminiExtractor';
import type { ImageChunk, ExtractionContext, GeminiConfig } from '../types';
import { GEMINI_DEFAULTS } from '../types';

// Mock p-limit (ESM-only module)
jest.mock('p-limit', () => {
  return (_concurrency: number) => {
    // Simple pass-through limiter for tests
    return <T>(fn: () => Promise<T>) => fn();
  };
});

// Mock the Google AI SDK
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { title: 'Test Product', discount_price: 2.99, valid_from: '2026-03-16', valid_until: '2026-03-22' },
          ]),
          usageMetadata: { totalTokenCount: 500 },
        },
      }),
    }),
  })),
}));

describe('GeminiExtractor', () => {
  const config: GeminiConfig = { ...GEMINI_DEFAULTS, apiKeys: ['testkey1', 'testkey2'] };
  const context: ExtractionContext = {
    supermarketSlug: 'dirk',
    supermarketName: 'Dirk',
    categorySlugList: ['overig'],
  };

  const chunk: ImageChunk = {
    buffer: Buffer.from('fake-image'),
    index: 0,
    totalChunks: 1,
  };

  it('extracts products from a single image chunk', async () => {
    const extractor = new GeminiExtractor(config);
    const result = await extractor.extractProducts([chunk], context);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].title).toBe('Test Product');
    expect(result.chunksProcessed).toBe(1);
    expect(result.chunksFailed).toBe(0);
  });

  it('handles multiple chunks and merges results', async () => {
    const extractor = new GeminiExtractor(config);
    const chunks: ImageChunk[] = [
      { buffer: Buffer.from('img1'), index: 0, totalChunks: 2 },
      { buffer: Buffer.from('img2'), index: 1, totalChunks: 2 },
    ];
    const result = await extractor.extractProducts(chunks, context);
    expect(result.products).toHaveLength(2); // 1 per chunk from mock
    expect(result.chunksProcessed).toBe(2);
  });

  it('reports token usage', async () => {
    const extractor = new GeminiExtractor(config);
    const result = await extractor.extractProducts([chunk], context);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
