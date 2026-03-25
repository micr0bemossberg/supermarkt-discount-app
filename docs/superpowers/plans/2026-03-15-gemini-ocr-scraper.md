# Gemini OCR Scraper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSS-selector-based scraping with Gemini Vision OCR extraction across all browser-based supermarket scrapers.

**Architecture:** Three pipelines (Publitas, Screenshot, API-unchanged) feed a shared GeminiExtractor service. Each concrete scraper becomes a thin config class (~20-40 lines) extending either PublitasOCRScraper or ScreenshotOCRScraper, delegating extraction to Gemini `gemini-3.1-flash-lite-preview` via a 10-key round-robin pool.

**Tech Stack:** TypeScript, Playwright, `@google/generative-ai` SDK, `p-limit`, Supabase, Jest

**Spec:** `docs/superpowers/specs/2026-03-15-gemini-ocr-scraper-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `src/gemini/types.ts` | ImageChunk, ExtractionContext, ExtractionResult, GeminiConfig interfaces |
| `src/gemini/keyPool.ts` | Round-robin API key pool with per-key cooldown (ported from ocrClient.ts) |
| `src/gemini/prompt.ts` | Prompt template builder for Gemini Vision |
| `src/gemini/responseParser.ts` | JSON parsing, validation, type coercion, date fallback |
| `src/gemini/GeminiExtractor.ts` | Core service: images → ExtractionResult via Google AI SDK |
| `src/scrapers/base/PublitasOCRScraper.ts` | Base class for Publitas-hosted flyer scrapers |
| `src/scrapers/base/ScreenshotOCRScraper.ts` | Base class for screenshot-based scrapers |
| `src/gemini/__tests__/responseParser.test.ts` | Unit tests for response parsing and validation |
| `src/gemini/__tests__/keyPool.test.ts` | Unit tests for key rotation and cooldown |
| `src/gemini/__tests__/prompt.test.ts` | Unit tests for prompt construction |
| `src/gemini/__tests__/GeminiExtractor.test.ts` | Unit tests with mocked Gemini API |
| `supabase/migrations/20260315000001_add_missing_categories.sql` | Add 5 missing category rows |

### Modified Files

| File | Change |
|---|---|
| `src/scrapers/base/BaseScraper.ts` | Add `getBrowserType()`, parameterize `initBrowser()` |
| `src/ocr/publitasImages.ts` | Add `downloadImageAsBuffer()` wrapper |
| `src/database/scrapeLogs.ts` | Support `status` field from ScrapeResult |
| `src/index.ts` | Register new scraper instances, add `--test-ocr` / `--dry-run` flags |
| `src/config/constants.ts` | Add `ALL_CATEGORY_SLUGS` constant and Gemini-related supermarket name map |
| `packages/shared/src/types/ScrapedProduct.ts` | Add `ScrapeStatus` type, `status` + `metadata` to ScrapeResult |
| `packages/scraper/package.json` | Add `@google/generative-ai`, `p-limit` |

### Rewritten Files (selector logic → thin config class)

| File | New base class | Lines before → after (approx) |
|---|---|---|
| `src/scrapers/vomar/VomarScraper.ts` | PublitasOCRScraper | 1401 → ~60 |
| `src/scrapers/dekamarkt/DekamarktScraper.ts` | PublitasOCRScraper | 335 → ~40 |
| `src/scrapers/dirk/DirkScraper.ts` | ScreenshotOCRScraper | 283 → ~30 |
| `src/scrapers/hoogvliet/HoogvlietScraper.ts` | ScreenshotOCRScraper | 243 → ~25 |
| `src/scrapers/aldi/AldiScraper.ts` | ScreenshotOCRScraper | 213 → ~30 |
| `src/scrapers/action/ActionScraper.ts` | ScreenshotOCRScraper | 257 → ~25 |
| `src/scrapers/kruidvat/KruidvatScraper.ts` | ScreenshotOCRScraper | 631 → ~30 |
| `src/scrapers/joybuy/JoybuyScraper.ts` | ScreenshotOCRScraper | 258 → ~30 |
| `src/scrapers/flink/FlinkScraper.ts` | ScreenshotOCRScraper | 223 → ~25 |
| `src/scrapers/megafoodstunter/MegafoodstunterScraper.ts` | ScreenshotOCRScraper | 221 → ~25 |
| `src/scrapers/butlon/ButlonScraper.ts` | ScreenshotOCRScraper | 228 → ~25 |
| `src/scrapers/jumbo/JumboScraper.ts` | ScreenshotOCRScraper | 124 → ~30 |

### Deleted Files

| File | Reason |
|---|---|
| `src/scrapers/ah/selectors.ts` | AH is API-only, selectors unused |
| `src/scrapers/aldi/selectors.ts` | Replaced by OCR |
| `src/scrapers/dekamarkt/selectors.ts` | Replaced by OCR |
| `src/scrapers/dirk/selectors.ts` | Replaced by OCR |
| `src/scrapers/jumbo/selectors.ts` | Replaced by OCR |
| `src/scrapers/vomar/selectors.ts` | Replaced by OCR |
| `src/ocr/ocrClient.ts` | Logic ported to gemini/GeminiExtractor.ts + gemini/keyPool.ts |
| `src/ocr/ocrValidator.ts` | Logic moved to gemini/responseParser.ts |
| `src/debug-vomar.ts` | Debug file, no longer relevant |
| `src/validate-vomar-ocr.ts` | Validation file, no longer relevant |

### Unchanged Files

| File | Reason |
|---|---|
| `src/scrapers/ah/AHScraper.ts` | API-only, no OCR needed |
| `src/scrapers/picnic/PicnicScraper.ts` | API-only, no OCR needed |
| `src/database/products.ts` | Insertion logic unchanged |
| `src/utils/imageProcessor.ts` | Image optimization unchanged |
| `src/utils/deduplication.ts` | Dedup logic unchanged |
| `src/utils/logger.ts` | Logger unchanged |
| `src/config/supabase.ts` | Supabase client unchanged |

---

## Chunk 1: GeminiExtractor Foundation

### Task 1: Install dependencies and set up types

**Files:**
- Modify: `packages/scraper/package.json`
- Create: `packages/scraper/src/gemini/types.ts`

- [ ] **Step 1: Install new dependencies**

```bash
cd packages/scraper && npm install @google/generative-ai@^0.21.0 p-limit@^5.0.0
```

> **Note**: `p-limit@5` is the last CommonJS version. v6 is ESM-only and won't work with `ts-node` in CJS mode.

- [ ] **Step 2: Create types file**

Create `packages/scraper/src/gemini/types.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/package.json packages/scraper/src/gemini/types.ts
git commit -m "feat: add Gemini OCR dependencies and type definitions"
```

---

### Task 2: Key pool with round-robin rotation and cooldown

**Files:**
- Create: `packages/scraper/src/gemini/keyPool.ts`
- Create: `packages/scraper/src/gemini/__tests__/keyPool.test.ts`

- [ ] **Step 1: Write failing tests for key pool**

Create `packages/scraper/src/gemini/__tests__/keyPool.test.ts`:

```typescript
import { KeyPool } from '../keyPool';

describe('KeyPool', () => {
  it('throws if constructed with empty keys', () => {
    expect(() => new KeyPool([])).toThrow('At least one API key required');
  });

  it('rotates keys round-robin', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    expect(pool.getNextKey()).toBe('key1');
    expect(pool.getNextKey()).toBe('key2');
    expect(pool.getNextKey()).toBe('key3');
    expect(pool.getNextKey()).toBe('key1'); // wraps around
  });

  it('skips keys that are on cooldown', () => {
    const pool = new KeyPool(['key1', 'key2', 'key3']);
    pool.getNextKey(); // key1
    pool.cooldownKey('key1', 5000); // 5s cooldown
    expect(pool.getNextKey()).toBe('key2');
    expect(pool.getNextKey()).toBe('key3');
    expect(pool.getNextKey()).toBe('key2'); // skips key1
  });

  it('returns null when all keys are on cooldown', () => {
    const pool = new KeyPool(['key1']);
    pool.cooldownKey('key1', 5000);
    expect(pool.getNextKey()).toBeNull();
  });

  it('re-enables keys after cooldown expires', () => {
    const pool = new KeyPool(['key1']);
    pool.cooldownKey('key1', 0); // expired cooldown
    expect(pool.getNextKey()).toBe('key1');
  });

  it('loads keys from env vars', () => {
    process.env.gemini_api_key1 = 'testkey1';
    process.env.gemini_api_key2 = 'testkey2';
    const pool = KeyPool.fromEnv();
    expect(pool.getNextKey()).toBe('testkey1');
    expect(pool.getNextKey()).toBe('testkey2');
    delete process.env.gemini_api_key1;
    delete process.env.gemini_api_key2;
  });

  it('reports available key count', () => {
    const pool = new KeyPool(['key1', 'key2']);
    expect(pool.availableCount()).toBe(2);
    pool.cooldownKey('key1', 5000);
    expect(pool.availableCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/keyPool.test.ts --no-cache
```

Expected: FAIL — `Cannot find module '../keyPool'`

- [ ] **Step 3: Implement key pool**

Create `packages/scraper/src/gemini/keyPool.ts`:

```typescript
import type { KeyState } from './types';

export class KeyPool {
  private keys: KeyState[];
  private currentIndex: number = 0;

  constructor(apiKeys: string[]) {
    if (apiKeys.length === 0) {
      throw new Error('At least one API key required');
    }
    this.keys = apiKeys.map((key) => ({ key, cooldownUntil: 0 }));
  }

  static fromEnv(): KeyPool {
    const keys: string[] = [];
    for (let i = 1; i <= 50; i++) {
      const key = process.env[`gemini_api_key${i}`];
      if (key) keys.push(key);
      else break;
    }
    if (keys.length === 0) {
      throw new Error(
        'No Gemini API keys found. Set gemini_api_key1, gemini_api_key2, ... in .env'
      );
    }
    return new KeyPool(keys);
  }

  getNextKey(): string | null {
    const now = Date.now();
    const totalKeys = this.keys.length;

    for (let i = 0; i < totalKeys; i++) {
      const index = (this.currentIndex + i) % totalKeys;
      const keyState = this.keys[index];

      if (keyState.cooldownUntil <= now) {
        this.currentIndex = (index + 1) % totalKeys;
        return keyState.key;
      }
    }

    return null; // All keys on cooldown
  }

  cooldownKey(key: string, durationMs: number): void {
    const keyState = this.keys.find((k) => k.key === key);
    if (keyState) {
      keyState.cooldownUntil = Date.now() + durationMs;
    }
  }

  availableCount(): number {
    const now = Date.now();
    return this.keys.filter((k) => k.cooldownUntil <= now).length;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/keyPool.test.ts --no-cache
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/gemini/keyPool.ts packages/scraper/src/gemini/__tests__/keyPool.test.ts
git commit -m "feat: add Gemini API key pool with round-robin rotation and cooldown"
```

---

### Task 3: Response parser with validation, coercion, and date fallback

**Files:**
- Create: `packages/scraper/src/gemini/responseParser.ts`
- Create: `packages/scraper/src/gemini/__tests__/responseParser.test.ts`

- [ ] **Step 1: Write failing tests for response parser**

Create `packages/scraper/src/gemini/__tests__/responseParser.test.ts`:

```typescript
import { parseGeminiResponse } from '../responseParser';

describe('parseGeminiResponse', () => {
  const baseProduct = {
    title: 'Karvan Cévitam',
    discount_price: 1.99,
    valid_from: '2026-03-16',
    valid_until: '2026-03-22',
  };

  it('parses valid JSON array into ScrapedProduct[]', () => {
    const raw = JSON.stringify([baseProduct]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Karvan Cévitam');
    expect(result[0].discount_price).toBe(1.99);
    expect(result[0].valid_from).toBeInstanceOf(Date);
    expect(result[0].valid_until).toBeInstanceOf(Date);
  });

  it('coerces Dutch comma-decimal prices to numbers', () => {
    const raw = JSON.stringify([{ ...baseProduct, discount_price: '1,99', original_price: '3,49' }]);
    const result = parseGeminiResponse(raw);
    expect(result[0].discount_price).toBe(1.99);
    expect(result[0].original_price).toBe(3.49);
  });

  it('filters out products missing required title', () => {
    const raw = JSON.stringify([{ discount_price: 1.99, valid_from: '2026-03-16', valid_until: '2026-03-22' }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products missing required discount_price', () => {
    const raw = JSON.stringify([{ title: 'Test', valid_from: '2026-03-16', valid_until: '2026-03-22' }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products with discount_price <= 0', () => {
    const raw = JSON.stringify([{ ...baseProduct, discount_price: 0 }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products where original_price < discount_price', () => {
    const raw = JSON.stringify([{ ...baseProduct, original_price: 0.99 }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('falls back to current week Monday/Sunday when dates are null', () => {
    const raw = JSON.stringify([{ title: 'Test', discount_price: 2.99, valid_from: null, valid_until: null }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
    const from = result[0].valid_from;
    const until = result[0].valid_until;
    expect(from.getDay()).toBe(1); // Monday
    expect(until.getDay()).toBe(0); // Sunday
    expect(until.getTime()).toBeGreaterThan(from.getTime());
  });

  it('replaces invalid category_slug with overig', () => {
    const validSlugs = ['dranken', 'overig'];
    const raw = JSON.stringify([{ ...baseProduct, category_slug: 'nonexistent' }]);
    const result = parseGeminiResponse(raw, validSlugs);
    expect(result[0].category_slug).toBe('overig');
  });

  it('keeps valid category_slug unchanged', () => {
    const validSlugs = ['dranken', 'overig'];
    const raw = JSON.stringify([{ ...baseProduct, category_slug: 'dranken' }]);
    const result = parseGeminiResponse(raw, validSlugs);
    expect(result[0].category_slug).toBe('dranken');
  });

  it('computes discount_percentage when prices are present but percentage is missing', () => {
    const raw = JSON.stringify([{ ...baseProduct, original_price: 4.00, discount_price: 3.00 }]);
    const result = parseGeminiResponse(raw);
    expect(result[0].discount_percentage).toBe(25);
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseGeminiResponse('not json at all');
    expect(result).toEqual([]);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const raw = '```json\n' + JSON.stringify([baseProduct]) + '\n```';
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result = parseGeminiResponse('[]');
    expect(result).toEqual([]);
  });

  it('defaults requires_card to false when missing', () => {
    const raw = JSON.stringify([baseProduct]);
    const result = parseGeminiResponse(raw);
    expect(result[0].requires_card).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/responseParser.test.ts --no-cache
```

Expected: FAIL — `Cannot find module '../responseParser'`

- [ ] **Step 3: Implement response parser**

Create `packages/scraper/src/gemini/responseParser.ts`:

```typescript
import type { ScrapedProduct } from '@supermarkt-deals/shared';

const ALL_CATEGORY_SLUGS = [
  'vers-gebak', 'vlees-vis-vega', 'zuivel-eieren', 'groente-fruit',
  'diepvries', 'dranken', 'bewaren', 'ontbijt', 'snoep-chips',
  'persoonlijke-verzorging', 'huishouden', 'baby-kind', 'elektronica',
  'wonen-keuken', 'sport-vrije-tijd', 'kleding-mode', 'overig',
];

function getCurrentWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getCurrentWeekSunday(): Date {
  const monday = getCurrentWeekMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

function coercePrice(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Handle Dutch comma-decimal: "1,99" → 1.99
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

function coerceDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function stripCodeFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

export function parseGeminiResponse(
  raw: string,
  validCategorySlugs: string[] = ALL_CATEGORY_SLUGS,
): ScrapedProduct[] {
  let parsed: unknown[];

  try {
    const cleaned = stripCodeFences(raw);
    const json = JSON.parse(cleaned);
    parsed = Array.isArray(json) ? json : [json];
  } catch {
    return [];
  }

  const products: ScrapedProduct[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;

    // Required fields
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const discountPrice = coercePrice(raw.discount_price);

    if (!title || !discountPrice || discountPrice <= 0) continue;

    // Optional price fields
    const originalPrice = coercePrice(raw.original_price);
    if (originalPrice !== undefined && originalPrice < discountPrice) continue;

    // Dates with fallback
    const validFrom = coerceDate(raw.valid_from) ?? getCurrentWeekMonday();
    const validUntil = coerceDate(raw.valid_until) ?? getCurrentWeekSunday();

    // Discount percentage
    let discountPercentage = typeof raw.discount_percentage === 'number'
      ? raw.discount_percentage
      : undefined;

    if (discountPercentage === undefined && originalPrice && discountPrice) {
      discountPercentage = Math.round((1 - discountPrice / originalPrice) * 100);
    }

    // Category validation
    let categorySlug = typeof raw.category_slug === 'string'
      ? raw.category_slug
      : undefined;

    if (categorySlug && !validCategorySlugs.includes(categorySlug)) {
      categorySlug = 'overig';
    }

    products.push({
      title,
      discount_price: discountPrice,
      original_price: originalPrice,
      discount_percentage: discountPercentage,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      unit_info: typeof raw.unit_info === 'string' ? raw.unit_info : undefined,
      image_url: typeof raw.image_url === 'string' ? raw.image_url : undefined,
      product_url: typeof raw.product_url === 'string' ? raw.product_url : undefined,
      valid_from: validFrom,
      valid_until: validUntil,
      category_slug: categorySlug,
      requires_card: typeof raw.requires_card === 'boolean' ? raw.requires_card : false,
    });
  }

  return products;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/responseParser.test.ts --no-cache
```

Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/gemini/responseParser.ts packages/scraper/src/gemini/__tests__/responseParser.test.ts
git commit -m "feat: add Gemini response parser with validation, coercion, and date fallback"
```

---

### Task 4: Prompt builder

**Files:**
- Create: `packages/scraper/src/gemini/prompt.ts`
- Create: `packages/scraper/src/gemini/__tests__/prompt.test.ts`

- [ ] **Step 1: Write failing tests for prompt builder**

Create `packages/scraper/src/gemini/__tests__/prompt.test.ts`:

```typescript
import { buildExtractionPrompt } from '../prompt';
import type { ExtractionContext } from '../types';

describe('buildExtractionPrompt', () => {
  const context: ExtractionContext = {
    supermarketSlug: 'dirk',
    supermarketName: 'Dirk van den Broek',
    categorySlugList: ['dranken', 'zuivel-eieren', 'overig'],
  };

  it('includes supermarket name in prompt', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('Dirk van den Broek');
  });

  it('includes all required field names', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('title');
    expect(prompt).toContain('discount_price');
    expect(prompt).toContain('original_price');
    expect(prompt).toContain('valid_from');
    expect(prompt).toContain('valid_until');
    expect(prompt).toContain('category_slug');
    expect(prompt).toContain('requires_card');
    expect(prompt).toContain('unit_info');
  });

  it('includes category slugs in prompt', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('dranken');
    expect(prompt).toContain('zuivel-eieren');
    expect(prompt).toContain('overig');
  });

  it('appends prompt hints when provided', () => {
    const withHints: ExtractionContext = {
      ...context,
      promptHints: 'This supermarket uses starburst badges for discounts.',
    };
    const prompt = buildExtractionPrompt(withHints);
    expect(prompt).toContain('starburst badges');
  });

  it('includes instruction to return JSON array', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('array');
  });

  it('includes Dutch language context', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toMatch(/[Dd]utch|[Nn]ederlands/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/prompt.test.ts --no-cache
```

Expected: FAIL — `Cannot find module '../prompt'`

- [ ] **Step 3: Implement prompt builder**

Create `packages/scraper/src/gemini/prompt.ts`:

```typescript
import type { ExtractionContext } from './types';

export function buildExtractionPrompt(context: ExtractionContext): string {
  const { supermarketName, categorySlugList, promptHints } = context;

  const categoryList = categorySlugList.map((s) => `"${s}"`).join(', ');

  let prompt = `You are a Dutch supermarket discount data extractor. Analyze this image from ${supermarketName} and extract ALL discount/deal products visible.

Return a JSON array where each element has these fields:

REQUIRED:
- "title" (string): Product name in Dutch as shown on the image
- "discount_price" (number): The discounted sale price in EUR (e.g., 1.99)

OPTIONAL:
- "original_price" (number): Price before discount, if visible (must be >= discount_price)
- "discount_percentage" (number): Discount percentage 0-100, if shown (e.g., from "25% KORTING" badge)
- "description" (string): Product subtitle or variant info (e.g., "Diverse varianten", "500ml")
- "unit_info" (string): Unit or quantity info (e.g., "per kg", "per stuk", "2 voor €3", "500 ml")
- "valid_from" (string): Discount start date as YYYY-MM-DD, if visible (e.g., from "Geldig van 16 maart")
- "valid_until" (string): Discount end date as YYYY-MM-DD, if visible (e.g., from "t/m 22 maart")
- "category_slug" (string): One of: [${categoryList}]. Classify based on product type.
- "requires_card" (boolean): true if a loyalty card badge is visible (e.g., "Bonuskaart", "Extra's", "Voordeelkaart")
- "image_url" (string): URL of the individual product image, only if visible as a URL in the image
- "product_url" (string): URL to the product page, only if visible

RULES:
- Extract EVERY product visible in the image. Do not skip any.
- Prices are in euros. Use decimal point (1.99), not comma.
- For dates, convert Dutch month names: januari=01, februari=02, maart=03, april=04, mei=05, juni=06, juli=07, augustus=08, september=09, oktober=10, november=11, december=12.
- If dates are not visible in this image, set valid_from and valid_until to null.
- If you cannot determine a field, omit it or set to null.
- Return ONLY the JSON array. No markdown, no explanation, no code fences.`;

  if (promptHints) {
    prompt += `\n\nADDITIONAL CONTEXT:\n${promptHints}`;
  }

  return prompt;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/prompt.test.ts --no-cache
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/gemini/prompt.ts packages/scraper/src/gemini/__tests__/prompt.test.ts
git commit -m "feat: add Gemini prompt builder for product extraction"
```

---

### Task 5: GeminiExtractor core service

**Files:**
- Create: `packages/scraper/src/gemini/GeminiExtractor.ts`
- Create: `packages/scraper/src/gemini/__tests__/GeminiExtractor.test.ts`

- [ ] **Step 1: Write failing tests for GeminiExtractor**

Create `packages/scraper/src/gemini/__tests__/GeminiExtractor.test.ts`:

```typescript
import { GeminiExtractor } from '../GeminiExtractor';
import type { ImageChunk, ExtractionContext, GeminiConfig } from '../types';
import { GEMINI_DEFAULTS } from '../types';

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/GeminiExtractor.test.ts --no-cache
```

Expected: FAIL — `Cannot find module '../GeminiExtractor'`

- [ ] **Step 3: Implement GeminiExtractor**

Create `packages/scraper/src/gemini/GeminiExtractor.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiConfig, ImageChunk, ExtractionContext, ExtractionResult } from './types';
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
    const pLimit = require('p-limit') as typeof import('p-limit')['default'];
    const limit = pLimit(this.config.maxConcurrent);

    const prompt = buildExtractionPrompt(context);
    let totalTokens = 0;
    let chunksFailed = 0;
    const allProducts: import('@supermarkt-deals/shared').ScrapedProduct[] = [];

    const tasks = images.map((chunk) =>
      limit(async () => {
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

    await Promise.allSettled(tasks);

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
        const model = genAI.getGenerativeModel({
          model: this.config.modelId,
          generationConfig: { temperature: this.config.temperature },
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

        // Non-retryable errors
        if (this.isAuthError(error)) {
          throw lastError;
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/scraper && npx jest src/gemini/__tests__/GeminiExtractor.test.ts --no-cache
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/gemini/GeminiExtractor.ts packages/scraper/src/gemini/__tests__/GeminiExtractor.test.ts
git commit -m "feat: add GeminiExtractor core service with concurrent chunk processing"
```

---

### Task 6: Gemini barrel export

**Files:**
- Create: `packages/scraper/src/gemini/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/scraper/src/gemini/index.ts`:

```typescript
export { GeminiExtractor } from './GeminiExtractor';
export { KeyPool } from './keyPool';
export { buildExtractionPrompt } from './prompt';
export { parseGeminiResponse } from './responseParser';
export type {
  GeminiConfig,
  ImageChunk,
  ExtractionContext,
  ExtractionResult,
  KeyState,
} from './types';
export { GEMINI_DEFAULTS } from './types';
```

- [ ] **Step 2: Run all Gemini tests together**

```bash
cd packages/scraper && npx jest src/gemini/ --no-cache
```

Expected: All tests PASS (keyPool: 7, responseParser: 14, prompt: 6, GeminiExtractor: 3 = 30 total)

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/src/gemini/index.ts
git commit -m "feat: add Gemini module barrel export"
```

---

## Chunk 2: Base Classes and Infrastructure

### Task 7: Modify BaseScraper to support browser type selection

**Files:**
- Modify: `packages/scraper/src/scrapers/base/BaseScraper.ts`

- [ ] **Step 1: Read current BaseScraper.ts to identify exact lines to change**

Read `packages/scraper/src/scrapers/base/BaseScraper.ts` — locate the `import { chromium }` line and the `initBrowser()` method.

- [ ] **Step 2: Add firefox import and getBrowserType() method**

At the top of `BaseScraper.ts` (line 6), change the import:

```typescript
// Before:
import { chromium, Browser, Page, BrowserContext } from 'playwright';

// After:
import { chromium, firefox, Browser, Page, BrowserContext } from 'playwright';
```

Add the `getBrowserType()` method to the class (before `initBrowser()`, after line 34):

```typescript
/**
 * Override in subclasses to use a different browser engine.
 * Default: 'chromium'. KruidvatScraper/JoybuyScraper use 'firefox'.
 */
protected getBrowserType(): 'chromium' | 'firefox' {
  return 'chromium';
}
```

Modify `initBrowser()` line 42 to use it:

```typescript
// Before (line 42):
this.browser = await chromium.launch({

// After:
const launcher = this.getBrowserType() === 'firefox' ? firefox : chromium;
this.browser = await launcher.launch({
```

- [ ] **Step 3: Verify existing scrapers still compile**

```bash
cd packages/scraper && npx tsc --noEmit
```

Expected: No new errors (existing scrapers inherit `'chromium'` default)

- [ ] **Step 4: Commit**

```bash
git add packages/scraper/src/scrapers/base/BaseScraper.ts
git commit -m "feat: parameterize BaseScraper browser type for Firefox support"
```

---

### Task 8: Update shared types (ScrapeStatus, ScrapeResult.status)

**Files:**
- Modify: `packages/shared/src/types/ScrapedProduct.ts`

- [ ] **Step 1: Read current ScrapedProduct.ts**

Read `packages/shared/src/types/ScrapedProduct.ts` — locate the `ScrapeResult` interface.

- [ ] **Step 2: Add ScrapeStatus type and status field**

Add before `ScrapeResult`:

```typescript
export type ScrapeStatus = 'success' | 'partial' | 'failed';
```

Add to `ScrapeResult` interface (as optional for backward compat with API scrapers):

```typescript
status?: ScrapeStatus;
metadata?: {
  chunks_processed: number;
  chunks_failed: number;
  pipeline_type: 'publitas' | 'screenshot' | 'api';
  gemini_tokens_used: number;
};
```

- [ ] **Step 3: Update shared index.ts export**

Add `ScrapeStatus` to the export list in `packages/shared/src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/ScrapedProduct.ts packages/shared/src/index.ts
git commit -m "feat: add ScrapeStatus type and metadata to ScrapeResult"
```

---

### Task 9: Update scrapeLogs.ts to use status field

**Files:**
- Modify: `packages/scraper/src/database/scrapeLogs.ts`

- [ ] **Step 1: Read current scrapeLogs.ts**

Read `packages/scraper/src/database/scrapeLogs.ts` — locate the `createScrapeLog()` function.

- [ ] **Step 2: Update status mapping**

Change the status derivation from:

```typescript
status: result.success ? 'success' : 'failed'
```

To:

```typescript
status: result.status ?? (result.success ? 'success' : 'failed')
```

This is backward-compatible: API scrapers that don't set `status` use the boolean fallback.

If `result.metadata` is present, append it as JSON to `error_message`:

```typescript
error_message: result.error_message || (result.metadata ? JSON.stringify(result.metadata) : null)
```

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/src/database/scrapeLogs.ts
git commit -m "feat: support partial status and metadata in scrape logs"
```

---

### Task 10: Modify publitasImages.ts — add Buffer download

**Files:**
- Modify: `packages/scraper/src/ocr/publitasImages.ts`

- [ ] **Step 1: Read current publitasImages.ts**

Read `packages/scraper/src/ocr/publitasImages.ts` — locate the `downloadImageAsBase64()` function.

- [ ] **Step 2: Add downloadImageAsBuffer() wrapper**

Add after the existing `downloadImageAsBase64()`:

```typescript
export async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  const base64 = await downloadImageAsBase64(url);
  return Buffer.from(base64, 'base64');
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/src/ocr/publitasImages.ts
git commit -m "feat: add downloadImageAsBuffer for OCR pipeline"
```

---

### Task 11: Create PublitasOCRScraper base class

**Files:**
- Create: `packages/scraper/src/scrapers/base/PublitasOCRScraper.ts`

- [ ] **Step 1: Create PublitasOCRScraper**

Create `packages/scraper/src/scrapers/base/PublitasOCRScraper.ts`:

```typescript
import { BaseScraper } from './BaseScraper';
import { GeminiExtractor, GEMINI_DEFAULTS } from '../../gemini';
import { downloadImageAsBuffer } from '../../ocr/publitasImages';
import { ALL_CATEGORY_SLUGS } from '../../config/constants';
import type { ScrapedProduct, SupermarketSlug } from '@supermarkt-deals/shared';
import type { ExtractionContext, ImageChunk } from '../../gemini/types';

interface SpreadPage {
  imageUrl: string;
  pageIndex: number;
}

export abstract class PublitasOCRScraper extends BaseScraper {
  private extractor: GeminiExtractor;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    super(supermarketSlug, baseUrl);
    this.extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 50 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });
  }

  /** Human-readable name for Gemini prompt context */
  abstract getSupermarketName(): string;

  /** Subclasses provide the Publitas folder URL */
  abstract getPublitasUrl(): string | Promise<string>;

  /** Override if Publitas URL is dynamic and needs browser to resolve */
  protected needsBrowserForUrl(): boolean {
    return false;
  }

  /** Page indices to skip (e.g., [0] for cover page) */
  protected getSkipPages(): number[] {
    return [0];
  }

  /** Extra Gemini prompt context */
  protected getPromptHints(): string {
    return '';
  }

  async scrapeProducts(): Promise<ScrapedProduct[]> {
    this.logger.info('Starting Publitas OCR scrape');

    // 1. Resolve Publitas URL (may need browser)
    if (this.needsBrowserForUrl()) {
      await this.initBrowser();
    }
    const publitasUrl = await this.getPublitasUrl();
    this.logger.info( Publitas URL: ${publitasUrl}`);

    // 2. Fetch spreads.json
    const spreads = await this.fetchSpreads(publitasUrl);
    this.logger.info( Found ${spreads.length} pages`);

    // 3. Download flyer page images
    const skipPages = new Set(this.getSkipPages());
    const pagesToProcess = spreads.filter((s) => !skipPages.has(s.pageIndex));

    const chunks: ImageChunk[] = [];
    for (const page of pagesToProcess) {
      try {
        const buffer = await downloadImageAsBuffer(page.imageUrl);
        chunks.push({
          buffer,
          index: page.pageIndex,
          totalChunks: spreads.length,
        });
      } catch (error) {
        this.logger.warning( Failed to download page ${page.pageIndex}: ${error}`);
      }
    }

    if (chunks.length === 0) {
      this.logger.error( No pages downloaded`);
      return [];
    }

    // 4. Send to GeminiExtractor
    const context: ExtractionContext = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    const result = await this.extractor.extractProducts(chunks, context);
    logger.info(
      `[${this.supermarketSlug}] Extracted ${result.products.length} products ` +
      `(${result.chunksProcessed} chunks OK, ${result.chunksFailed} failed, ${result.tokensUsed} tokens)`
    );

    return result.products;
  }

  private async fetchSpreads(publitasUrl: string): Promise<SpreadPage[]> {
    // Try common Publitas API patterns
    const urls = [
      `${publitasUrl}/spreads.json`,
      `${publitasUrl.replace(/\/$/, '')}/spreads.json`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        return this.parseSpreadsData(data);
      } catch {
        continue;
      }
    }

    throw new Error(`Failed to fetch spreads.json from ${publitasUrl}`);
  }

  private parseSpreadsData(data: unknown): SpreadPage[] {
    const pages: SpreadPage[] = [];

    if (!Array.isArray(data)) return pages;

    for (let i = 0; i < data.length; i++) {
      const spread = data[i];
      if (spread && typeof spread === 'object') {
        // Publitas spreads have various image URL formats
        const imageUrl =
          spread.imageUrl || spread.image_url || spread.url ||
          spread.pages?.[0]?.imageUrl || spread.pages?.[0]?.image_url;

        if (typeof imageUrl === 'string') {
          pages.push({ imageUrl, pageIndex: i });
        }
      }
    }

    return pages;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/scraper && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/src/scrapers/base/PublitasOCRScraper.ts
git commit -m "feat: add PublitasOCRScraper base class for flyer-based scrapers"
```

---

### Task 12: Create ScreenshotOCRScraper base class

**Files:**
- Create: `packages/scraper/src/scrapers/base/ScreenshotOCRScraper.ts`

- [ ] **Step 1: Create ScreenshotOCRScraper**

Create `packages/scraper/src/scrapers/base/ScreenshotOCRScraper.ts`:

```typescript
import type { Page } from 'playwright';
import { BaseScraper } from './BaseScraper';
import { GeminiExtractor, GEMINI_DEFAULTS } from '../../gemini';
import { ALL_CATEGORY_SLUGS } from '../../config/constants';
import type { ScrapedProduct, SupermarketSlug } from '@supermarkt-deals/shared';
import type { ExtractionContext, ImageChunk } from '../../gemini/types';

export interface ScrollConfig {
  viewportWidth: number;
  viewportHeight: number;
  overlapPercent: number;
  maxChunks: number;
  scrollDelayMs: [number, number];
}

const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  viewportWidth: 1280,
  viewportHeight: 800,
  overlapPercent: 0.2,
  maxChunks: 25,
  scrollDelayMs: [500, 1500],
};

export abstract class ScreenshotOCRScraper extends BaseScraper {
  private extractor: GeminiExtractor;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    super(supermarketSlug, baseUrl);
    this.extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 50 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });
  }

  /** Human-readable name for Gemini prompt context */
  abstract getSupermarketName(): string;

  /** Subclasses provide the target URL */
  abstract getTargetUrl(): string;

  /** Override for scroll behavior */
  protected getScrollConfig(): ScrollConfig {
    return DEFAULT_SCROLL_CONFIG;
  }

  /** Extra Gemini prompt context */
  protected getPromptHints(): string {
    return '';
  }

  /** Optional pre-screenshot page interaction (click "Toon meer", dismiss overlays) */
  protected async beforeScreenshots(_page: Page): Promise<void> {
    // Default: no-op
  }

  async scrapeProducts(): Promise<ScrapedProduct[]> {
    const url = this.getTargetUrl();
    const config = this.getScrollConfig();

    this.logger.info( Starting Screenshot OCR scrape: ${url}`);

    // 1. Navigate — initBrowser() creates this.page
    const page = await this.initBrowser();
    await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Handle cookie consent (inherited from BaseScraper)
    await this.handleCookieConsent(page);

    // 3. Pre-screenshot interaction
    try {
      await this.beforeScreenshots(page);
    } catch (error) {
      this.logger.warning( beforeScreenshots() failed: ${error}`);
    }

    // 4. Wait for content to settle
    await page.waitForTimeout(2000);

    // 5. Capture scrolling screenshots with overlap
    const chunks = await this.captureScrollingScreenshots(page, config);
    this.logger.info( Captured ${chunks.length} screenshot chunks`);

    if (chunks.length === 0) {
      this.logger.error( No screenshots captured`);
      return [];
    }

    // 6. Send to GeminiExtractor
    const context: ExtractionContext = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    const result = await this.extractor.extractProducts(chunks, context);
    logger.info(
      `[${this.supermarketSlug}] Extracted ${result.products.length} products ` +
      `(${result.chunksProcessed} chunks OK, ${result.chunksFailed} failed, ${result.tokensUsed} tokens)`
    );

    // 7. Cross-chunk dedup (overlap zone)
    const deduped = this.deduplicateProducts(result.products);
    this.logger.info( After dedup: ${deduped.length} products`);

    return deduped;
  }

  private async captureScrollingScreenshots(
    page: Page,
    config: ScrollConfig,
  ): Promise<ImageChunk[]> {
    // Measure total page height
    let totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    if (totalHeight <= 0) {
      await page.waitForTimeout(3000);
      totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    }

    if (totalHeight <= 0) return [];

    const stepSize = Math.floor(config.viewportHeight * (1 - config.overlapPercent));
    const numChunks = Math.min(
      Math.ceil(totalHeight / stepSize),
      config.maxChunks,
    );

    const chunks: ImageChunk[] = [];

    for (let i = 0; i < numChunks; i++) {
      const scrollY = i * stepSize;

      await page.evaluate((y) => window.scrollTo(0, y), scrollY);

      // Random delay between scrolls (anti-bot)
      const [minDelay, maxDelay] = config.scrollDelayMs;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      await page.waitForTimeout(delay);

      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: config.viewportWidth,
          height: config.viewportHeight,
        },
      });

      chunks.push({
        buffer: screenshot,
        index: i,
        totalChunks: numChunks,
      });
    }

    return chunks;
  }

  private deduplicateProducts(products: ScrapedProduct[]): ScrapedProduct[] {
    const seen = new Set<string>();
    const result: ScrapedProduct[] = [];

    for (const product of products) {
      const key = this.normalizeForDedup(product);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(product);
      }
    }

    return result;
  }

  private normalizeForDedup(product: ScrapedProduct): string {
    const title = product.title.toLowerCase().trim().replace(/\s+/g, ' ');
    const price = product.discount_price.toFixed(2);
    const unit = (product.unit_info || '').toLowerCase().trim();
    return `${title}|${price}|${unit}`;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd packages/scraper && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/src/scrapers/base/ScreenshotOCRScraper.ts
git commit -m "feat: add ScreenshotOCRScraper base class with scrolling capture"
```

---

## Chunk 3: Scraper Rewrites

### Task 13: Rewrite Publitas scrapers (Vomar, Dekamarkt)

**Files:**
- Rewrite: `packages/scraper/src/scrapers/vomar/VomarScraper.ts` (1401 → ~60 lines)
- Rewrite: `packages/scraper/src/scrapers/dekamarkt/DekamarktScraper.ts` (335 → ~40 lines)

- [ ] **Step 1: Rewrite VomarScraper**

Replace `packages/scraper/src/scrapers/vomar/VomarScraper.ts` entirely:

```typescript
import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class VomarScraper extends PublitasOCRScraper {
  constructor() {
    super('vomar', 'https://www.vomar.nl/aanbiedingen');
  }

  getSupermarketName() { return 'Vomar'; }

  protected needsBrowserForUrl(): boolean {
    return true; // Vomar's Publitas URL changes weekly
  }

  async getPublitasUrl(): Promise<string> {
    // Navigate to Vomar's aanbiedingen page to find the current Publitas embed
    const page = await this.initBrowser();
    await page.goto('https://www.vomar.nl/aanbiedingen', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Extract the Publitas embed URL from the page
    const publitasUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="publitas"]');
      return iframe?.getAttribute('src') || null;
    });

    await page.close();

    if (!publitasUrl) {
      throw new Error('Could not find Publitas embed URL on Vomar aanbiedingen page');
    }

    return publitasUrl;
  }

  protected getPromptHints(): string {
    return 'Vomar uses a digital flyer (folder). Products may show "Vomar app" which means a digital coupon is required.';
  }
}
```

- [ ] **Step 2: Rewrite DekamarktScraper**

Replace `packages/scraper/src/scrapers/dekamarkt/DekamarktScraper.ts` entirely:

```typescript
import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class DekamarktScraper extends PublitasOCRScraper {
  constructor() {
    super('dekamarkt', 'https://folder.dekamarkt.nl');
  }

  getSupermarketName() { return 'DekaMarkt'; }

  getPublitasUrl(): string {
    return 'https://folder.dekamarkt.nl';
  }

  protected getPromptHints(): string {
    return 'DekaMarkt digital flyer. Look for "per stuk" and "per kilo" unit pricing.';
  }
}
```

- [ ] **Step 3: Delete old selector files**

```bash
rm packages/scraper/src/scrapers/vomar/selectors.ts
rm packages/scraper/src/scrapers/dekamarkt/selectors.ts
```

- [ ] **Step 4: Verify compilation**

```bash
cd packages/scraper && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -u packages/scraper/src/scrapers/vomar/ packages/scraper/src/scrapers/dekamarkt/
git commit -m "feat: rewrite Vomar and DekaMarkt scrapers to use PublitasOCRScraper"
```

---

### Task 14: Rewrite Screenshot scrapers (all 10)

**Files:**
- Rewrite: All 10 screenshot-based scrapers
- Delete: selector files for dirk, jumbo, aldi, ah

Each rewritten scraper follows the same thin pattern. Here are all 10:

- [ ] **Step 1: Rewrite DirkScraper**

Replace `packages/scraper/src/scrapers/dirk/DirkScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class DirkScraper extends ScreenshotOCRScraper {
  constructor() { super('dirk', 'https://www.dirk.nl/aanbiedingen'); }
  getSupermarketName() { return 'Dirk van den Broek'; }

  getTargetUrl() {
    return 'https://www.dirk.nl/aanbiedingen';
  }
}
```

- [ ] **Step 2: Rewrite HoogvlietScraper**

Replace `packages/scraper/src/scrapers/hoogvliet/HoogvlietScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class HoogvlietScraper extends ScreenshotOCRScraper {
  constructor() { super('hoogvliet', 'https://www.hoogvliet.com/aanbiedingen'); }
  getSupermarketName() { return 'Hoogvliet'; }

  getTargetUrl() {
    return 'https://www.hoogvliet.com/aanbiedingen';
  }
}
```

- [ ] **Step 3: Rewrite AldiScraper**

Replace `packages/scraper/src/scrapers/aldi/AldiScraper.ts`:

```typescript
import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class AldiScraper extends ScreenshotOCRScraper {
  constructor() { super('aldi', 'https://www.aldi.nl/aanbiedingen'); }
  getSupermarketName() { return 'Aldi'; }

  getTargetUrl() {
    return 'https://www.aldi.nl/aanbiedingen';
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Click "Toon meer" button if present to load all products
    const showMore = page.locator('button:has-text("Toon meer"), button:has-text("Meer laden")');
    while (await showMore.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(1000);
    }
  }

  protected getPromptHints(): string {
    return 'Aldi runs Thursday-to-Wednesday deal cycles (not Monday-Sunday). Extract dates carefully.';
  }
}
```

- [ ] **Step 4: Rewrite ActionScraper**

Replace `packages/scraper/src/scrapers/action/ActionScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class ActionScraper extends ScreenshotOCRScraper {
  constructor() { super('action', 'https://www.action.com/nl-nl/weekactie/'); }
  getSupermarketName() { return 'Action'; }

  getTargetUrl() {
    return 'https://www.action.com/nl-nl/weekactie/';
  }

  protected getPromptHints(): string {
    return 'Action sells non-food items (household, electronics, toys). Categorize accordingly.';
  }
}
```

- [ ] **Step 5: Rewrite KruidvatScraper (Firefox)**

Replace `packages/scraper/src/scrapers/kruidvat/KruidvatScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class KruidvatScraper extends ScreenshotOCRScraper {
  constructor() { super('kruidvat', 'https://www.kruidvat.nl/acties'); }
  getSupermarketName() { return 'Kruidvat'; }

  protected getBrowserType(): 'chromium' | 'firefox' {
    return 'firefox'; // Chromium blocked by TLS fingerprinting
  }

  getTargetUrl() {
    return 'https://www.kruidvat.nl/acties';
  }

  protected getPromptHints(): string {
    return 'Kruidvat sells personal care, beauty, and household items. Look for "1+1 gratis" and "2e halve prijs" deals.';
  }
}
```

- [ ] **Step 6: Rewrite JoybuyScraper (Firefox)**

Replace `packages/scraper/src/scrapers/joybuy/JoybuyScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class JoybuyScraper extends ScreenshotOCRScraper {
  constructor() { super('joybuy', 'https://www.joybuy.nl'); }
  getSupermarketName() { return 'JoyBuy'; }

  protected getBrowserType(): 'chromium' | 'firefox' {
    return 'firefox';
  }

  getTargetUrl() {
    return 'https://www.joybuy.nl';
  }
}
```

- [ ] **Step 7: Rewrite FlinkScraper**

Replace `packages/scraper/src/scrapers/flink/FlinkScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class FlinkScraper extends ScreenshotOCRScraper {
  constructor() { super('flink', 'https://www.goflink.com/shop/nl-NL/'); }
  getSupermarketName() { return 'Flink'; }

  getTargetUrl() {
    return 'https://www.goflink.com/shop/nl-NL/';
  }
}
```

- [ ] **Step 8: Rewrite MegafoodstunterScraper**

Replace `packages/scraper/src/scrapers/megafoodstunter/MegafoodstunterScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class MegafoodstunterScraper extends ScreenshotOCRScraper {
  constructor() { super('megafoodstunter', 'https://www.megafoodstunter.nl'); }
  getSupermarketName() { return 'MegaFoodstunter'; }

  getTargetUrl() {
    return 'https://www.megafoodstunter.nl';
  }
}
```

- [ ] **Step 9: Rewrite ButlonScraper**

Replace `packages/scraper/src/scrapers/butlon/ButlonScraper.ts`:

```typescript
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class ButlonScraper extends ScreenshotOCRScraper {
  constructor() { super('butlon', 'https://www.butlon.nl'); }
  getSupermarketName() { return 'Butlon'; }

  getTargetUrl() {
    return 'https://www.butlon.nl';
  }
}
```

- [ ] **Step 10: Rewrite JumboScraper (Screenshot pipeline)**

Replace `packages/scraper/src/scrapers/jumbo/JumboScraper.ts`:

```typescript
import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class JumboScraper extends ScreenshotOCRScraper {
  constructor() { super('jumbo', 'https://www.jumbo.com/aanbiedingen'); }
  getSupermarketName() { return 'Jumbo'; }

  getTargetUrl() {
    return 'https://www.jumbo.com/aanbiedingen';
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Jumbo may lazy-load deals — scroll to trigger
    const loadMore = page.locator('button:has-text("Meer laden"), button:has-text("Laad meer")');
    while (await loadMore.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loadMore.click();
      await page.waitForTimeout(1500);
    }
  }

  protected getPromptHints(): string {
    return 'Jumbo shows "Extra\'s" deals that require a loyalty card. Mark requires_card=true for these.';
  }
}
```

- [ ] **Step 11: Delete all selector files and unused files**

```bash
rm -f packages/scraper/src/scrapers/dirk/selectors.ts
rm -f packages/scraper/src/scrapers/jumbo/selectors.ts
rm -f packages/scraper/src/scrapers/aldi/selectors.ts
rm -f packages/scraper/src/scrapers/ah/selectors.ts
rm -f packages/scraper/src/ocr/ocrClient.ts
rm -f packages/scraper/src/ocr/ocrValidator.ts
rm -f packages/scraper/src/debug-vomar.ts
rm -f packages/scraper/src/validate-vomar-ocr.ts
```

- [ ] **Step 12: Verify compilation**

```bash
cd packages/scraper && npx tsc --noEmit
```

Fix any compilation errors (likely import updates in `index.ts` — handled in next task).

- [ ] **Step 13: Commit**

```bash
git add -u packages/scraper/src/scrapers/ packages/scraper/src/ocr/ packages/scraper/src/
git commit -m "feat: rewrite all browser-based scrapers to use Gemini OCR

Vomar, DekaMarkt → PublitasOCRScraper
Dirk, Hoogvliet, Aldi, Action, Kruidvat, Joybuy, Flink,
Megafoodstunter, Butlon, Jumbo → ScreenshotOCRScraper

Delete all selectors.ts files and old OCR modules."
```

---

## Chunk 4: Integration, Migration, and Finalization

### Task 15: Update index.ts with CLI flags

**Files:**
- Modify: `packages/scraper/src/index.ts`

- [ ] **Step 1: Read current index.ts**

Read `packages/scraper/src/index.ts` to understand the current CLI entry point.

- [ ] **Step 2: Add --test-ocr and --dry-run flags**

Update the CLI argument parsing to support:

- `--test-ocr` — captures 1 screenshot or 1 flyer page, sends to Gemini, prints raw output. No DB insertion.
- `--dry-run` — full pipeline but skips DB insertion. Prints `ScrapedProduct[]` to console.

Update the imports to match the new scraper class names (most imports stay the same since class names haven't changed — just internals).

Ensure all scraper registrations work with the new classes.

- [ ] **Step 3: Verify it compiles and runs help**

```bash
cd packages/scraper && npx tsc --noEmit
cd packages/scraper && npx ts-node src/index.ts --help 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add packages/scraper/src/index.ts
git commit -m "feat: add --test-ocr and --dry-run CLI flags for OCR development"
```

---

### Task 16: Create category migration

**Files:**
- Create: `supabase/migrations/20260315000001_add_missing_categories.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260315000001_add_missing_categories.sql`:

```sql
-- Add 5 categories defined in CategorySlug type but missing from seed data
INSERT INTO categories (name, slug, icon_name) VALUES
  ('Baby & Kind', 'baby-kind', 'baby-carriage'),
  ('Elektronica', 'elektronica', 'laptop'),
  ('Wonen & Keuken', 'wonen-keuken', 'silverware-fork-knife'),
  ('Sport & Vrije Tijd', 'sport-vrije-tijd', 'run'),
  ('Kleding & Mode', 'kleding-mode', 'tshirt-crew')
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260315000001_add_missing_categories.sql
git commit -m "feat: add 5 missing category rows to align DB with CategorySlug type"
```

---

### Task 17: Run full test suite and integration smoke test

- [ ] **Step 1: Run all unit tests**

```bash
cd packages/scraper && npx jest src/gemini/ --no-cache --verbose
```

Expected: All 30 tests PASS

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd packages/scraper && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Integration smoke test (requires API key)**

```bash
cd packages/scraper && npx ts-node src/index.ts --supermarket=dirk --test-ocr
```

Expected: Captures 1 screenshot from dirk.nl, sends to Gemini, prints extracted products. No DB writes.

- [ ] **Step 4: Dry-run a full scrape**

```bash
cd packages/scraper && npx ts-node src/index.ts --supermarket=dirk --dry-run
```

Expected: Full screenshot pipeline, Gemini extraction, prints all products. No DB writes.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize Gemini OCR scraper integration"
```

---

## Summary

| Chunk | Tasks | Key Deliverable |
|---|---|---|
| 1: Foundation | Tasks 1-6 | GeminiExtractor with 30 unit tests |
| 2: Base Classes | Tasks 7-12 | BaseScraper mod, PublitasOCRScraper, ScreenshotOCRScraper |
| 3: Rewrites | Tasks 13-14 | 12 scrapers rewritten (~5000 lines removed, ~400 added) |
| 4: Integration | Tasks 15-17 | CLI flags, migration, smoke tests |

**Total estimated code change:** ~5500 lines deleted, ~1200 lines added, 30 unit tests.
 