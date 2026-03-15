# Gemini OCR Scraper Design Spec

**Date**: 2026-03-15
**Branch**: `feature/gemini-ocr-scraper`
**Status**: Draft — Rev 2 (post-review fixes)

## Problem

The current scraper architecture relies on CSS selectors to extract product data from supermarket websites. These selectors are the most fragile part of the system — they break whenever a site redesigns its HTML. There are 14 individual scraper classes, each with hundreds of lines of selector logic that require constant maintenance.

## Solution

Replace CSS-selector-based extraction with Gemini Vision OCR (`gemini-3.1-flash-lite-preview`). Instead of parsing DOM elements, we capture visual representations of discount pages (flyer images or screenshots) and let Gemini extract structured product data from them.

## Architecture Overview

Three distinct input pipelines feed a shared `GeminiExtractor` service:

```
BaseScraper (existing — minor modification: parameterize browser type)
│
│  ┌─────────────────────────────────────────────────┐
│  │         GeminiExtractor (shared service)         │
│  │  - Accepts image Buffer(s)                       │
│  │  - Sends to gemini-3.1-flash-lite-preview        │
│  │  - Structured JSON prompt → ScrapedProduct[]     │
│  │  - Concurrent worker pool (p-limit, max 3)       │
│  │  - Multi-key round-robin pool (ported from       │
│  │    existing ocrClient.ts)                        │
│  └──────────┬──────────────┬──────────────┬─────────┘
│             │              │              │
│     ┌───────┴───┐   ┌─────┴─────┐   ┌────┴────┐
│     │ Publitas  │   │Screenshot │   │  API    │
│     │ Pipeline  │   │ Pipeline  │   │Pipeline │
│     └───────────┘   └───────────┘   └─────────┘
│
├── PublitasOCRScraper (extends BaseScraper)
│   │  May use browser for dynamic URL resolution, then
│   │  fetches spreads.json via HTTP for page images.
│   │
│   ├── VomarScraper
│   ├── DekamarktScraper
│   ├── BoniScraper (future)
│   └── JumboScraper (pending Publitas verification — Screenshot fallback)
│
├── ScreenshotOCRScraper (extends BaseScraper)
│   │  Overrides initBrowser() to support browser type selection.
│   │
│   ├── DirkScraper
│   ├── HoogvlietScraper
│   ├── AldiScraper
│   ├── ActionScraper
│   ├── KruidvatScraper (Firefox)
│   ├── JoybuyScraper (Firefox)
│   ├── FlinkScraper
│   ├── MegafoodstunterScraper
│   └── ButlonScraper
│
├── AHScraper (unchanged — API-only)
└── PicnicScraper (unchanged — API-only)
```

### Pipeline Assignment Rationale

| Supermarket | Pipeline | Reason |
|---|---|---|
| Vomar | Publitas | `view.publitas.com` embed, spreads.json available |
| Dekamarkt | Publitas | `folder.dekamarkt.nl` white-labeled Publitas |
| Boni (future) | Publitas | Confirmed on `view.publitas.com` |
| Jumbo | Screenshot (default) | Likely Publitas but unverified. Starts as Screenshot; move to Publitas if confirmed. |
| Dirk | Screenshot | Self-hosted Vue.js app |
| Hoogvliet | Screenshot | Self-hosted Intershop platform |
| Aldi | Screenshot | Self-hosted Next.js + Algolia |
| Action | Screenshot | Self-hosted Next.js |
| Kruidvat | Screenshot | Heavy anti-bot, Firefox required |
| Joybuy | Screenshot | Firefox required |
| Flink | Screenshot | Self-hosted. **Note**: currently excluded from `all` in index.ts due to DataDome blocking. OCR migration applies but Flink remains excluded from daily runs until blocking is resolved. |
| Megafoodstunter | Screenshot | Self-hosted |
| Butlon | Screenshot | Self-hosted |
| Albert Heijn | API (unchanged) | Mobile API returns structured data |
| Picnic | API (unchanged) | REST API returns structured data |

### Supermarkets Not Covered

| Slug | Status | Notes |
|---|---|---|
| `lidl` | No scraper | `LidlScraper.ts` was deleted from the codebase. Lidl remains in seed data but has no active scraper. Out of scope for this spec. |
| `plus` | No scraper | Defined in `SupermarketSlug` type but no scraper exists and no supermarket row is seeded. Out of scope. |

## BaseScraper Modifications

`BaseScraper.ts` requires **one small change**: parameterize browser type in `initBrowser()`.

### Current Code (line 42)

```typescript
async initBrowser() {
  this.browser = await chromium.launch({ ... });
}
```

### Modified Code

```typescript
protected getBrowserType(): 'chromium' | 'firefox' {
  return 'chromium'; // Default, overridable by subclasses
}

async initBrowser() {
  const browserType = this.getBrowserType();
  const launcher = browserType === 'firefox' ? firefox : chromium;
  this.browser = await launcher.launch({ ... });
}
```

This is a **backward-compatible** change — all existing scrapers inherit the `'chromium'` default. Only `KruidvatScraper` and `JoybuyScraper` override to `'firefox'`.

**Additionally**: `BaseScraper.run()` wraps `scrapeProducts()` in `retryOperation()` (3 retries with exponential backoff). OCR scrapers handle retries internally per-chunk, so they must **not throw** on partial failures. Instead, `scrapeProducts()` returns whatever products it successfully extracted (even if some chunks failed), and reports chunk failures via the `ScrapeResult` metadata. The outer retry only triggers on complete failures (e.g., browser crash, network down).

## GeminiExtractor Service

The shared service that converts images into structured product data.

### Interface

```typescript
class GeminiExtractor {
  constructor(config: GeminiConfig)

  extractProducts(
    images: ImageChunk[],
    context: ExtractionContext
  ): Promise<ExtractionResult>
}

interface GeminiConfig {
  apiKeys: string[]             // Round-robin key pool (1 or more keys)
  modelId: string               // Default: 'gemini-3.1-flash-lite-preview'
  maxConcurrent: number         // Default: 3 (implemented via p-limit)
  retryAttempts: number         // Default: 2
  temperature: number           // Default: 0.1
}

interface ImageChunk {
  buffer: Buffer                // Image data (screenshot or flyer page)
  index: number                 // Order in sequence
  totalChunks: number           // "Page 3 of 12" — helps Gemini understand scope
}

interface ExtractionContext {
  supermarketSlug: string       // Which supermarket (e.g., "dirk")
  supermarketName: string       // Human-readable (e.g., "Dirk van den Broek")
  categorySlugList: string[]    // All 17 valid category slugs
  promptHints?: string          // Per-supermarket extra instructions
}

interface ExtractionResult {
  products: ScrapedProduct[]
  chunksProcessed: number
  chunksFailed: number
  tokensUsed: number
}
```

### API Key Pool (Ported from ocrClient.ts)

The existing `ocrClient.ts` implements a sophisticated multi-key pool with:

- Round-robin key rotation across up to 50 keys
- Per-key expiration tracking (cooldown when rate-limited)
- Rate limit header parsing (seconds and milliseconds patterns)
- Automatic fallback to next key on 429 errors

This logic is **preserved and ported** into `GeminiExtractor`. The constructor accepts `apiKeys: string[]` — if only one key is provided, it works as a simple single-key client. With multiple keys, it rotates to maximize throughput.

Environment variable: `GEMINI_API_KEYS` (comma-separated list, replaces single `GEMINI_API_KEY`).

### Concurrency

Parallel chunk processing uses `p-limit` (already in the npm ecosystem, zero-dependency). Each Gemini API call is a promise; `p-limit(maxConcurrent)` ensures at most 3 run simultaneously. Combined with the key pool, this prevents rate limiting while maximizing throughput.

### What Gemini Extracts (All Fields From Image)

| Field | Type | Required | Fallback if missing | Notes |
|---|---|---|---|---|
| `title` | `string` | YES | (none — product skipped) | Product name |
| `discount_price` | `number` | YES | (none — product skipped) | Sale price in EUR |
| `original_price` | `number` | no | `null` | Price before discount |
| `discount_percentage` | `number` | no | Computed in `responseParser.ts` if both prices present | Read from badges like "25% KORTING" |
| `description` | `string` | no | `null` | Subtitle, variant info |
| `unit_info` | `string` | no | `null` | "per kg", "500g", "2 voor €3" |
| `valid_from` | `Date` | YES | **Current week Monday** | Extracted from "Geldig van..." text |
| `valid_until` | `Date` | YES | **Current week Sunday** | Extracted from "...t/m zondag" text |
| `category_slug` | `string` | no | `'overig'` | Classified from visual context + valid slug list |
| `requires_card` | `boolean` | no | `false` | Spotted from loyalty badges |
| `image_url` | `string` | no | `null` | Usually null from screenshots; Publitas may provide |
| `product_url` | `string` | no | `null` | Usually null from OCR |

**Date extraction fallback**: Gemini is instructed to extract `valid_from`/`valid_until` from the visual content (flyer headers like "Geldig van 16 t/m 22 maart"). If Gemini returns `null` for either date, the `responseParser` falls back to current week Monday–Sunday. This handles:

- Screenshot chunks that don't include the date header
- Pages where dates are in an unusual format
- Mid-week starts (Aldi: Thursday–Wednesday) are still extracted correctly when visible

### What Stays Programmatic (Not OCR)

| Field | Source |
|---|---|
| `supermarketSlug` | Known from which scraper is running |
| `supermarket_id` | DB lookup from slug |
| `category_id` | DB lookup from `category_slug` |
| `scrape_hash` | SHA-256 computed from slug + title + dates |
| `image_storage_path` | Generated during image optimization |
| `is_active` | Set to `true` on insert |

### Configuration

```typescript
const GEMINI_DEFAULTS: GeminiConfig = {
  apiKeys: [],                              // From GEMINI_API_KEYS env var
  modelId: 'gemini-3.1-flash-lite-preview',
  maxConcurrent: 3,
  retryAttempts: 2,
  temperature: 0.1,
}
```

### Prompt Strategy

The prompt instructs Gemini to:

1. Act as a Dutch supermarket discount data extractor
2. Return a JSON array matching the `ScrapedProduct` schema
3. Extract dates from visual context ("Geldig van/t/m..." headers) — return `null` if not visible
4. Classify products into one of the 17 provided category slugs
5. Spot loyalty card requirements from badges
6. Use the Google AI SDK's `responseSchema` to enforce valid JSON structure

### Response Parsing

`responseParser.ts` handles:

- JSON.parse with error recovery
- Type coercion: string prices `"1,99"` → `1.99`, Dutch dates → `Date` objects
- Required field validation: products without `title` or `discount_price` are filtered out
- Price sanity checks: `discount_price` must be > 0, `original_price` >= `discount_price`
- **Discount percentage computation**: if `original_price` and `discount_price` are present but `discount_percentage` is null, compute as `Math.round((1 - discount_price / original_price) * 100)`
- **Date fallback**: `null` dates → current week Monday/Sunday
- **Category validation**: `category_slug` not in valid set → replaced with `'overig'`

### Internal Components

```
packages/scraper/src/gemini/
├── GeminiExtractor.ts     // Core service: image → ExtractionResult
├── keyPool.ts             // Round-robin API key pool (ported from ocrClient.ts)
├── prompt.ts              // Prompt template + builder
├── responseParser.ts      // JSON parsing + validation + type coercion
└── types.ts               // ImageChunk, ExtractionContext, GeminiConfig, etc.
```

## Publitas Pipeline (`PublitasOCRScraper`)

Handles supermarkets whose flyers are hosted on Publitas.

### Browser Usage Clarification

Some Publitas supermarkets (notably Vomar) have **dynamically changing folder URLs** that require browser navigation to resolve. The current `VomarScraper` navigates to the Publitas page in Playwright to discover the current folder URL and intercept the `spreads.json` network request.

`PublitasOCRScraper` therefore **may use a browser** for URL resolution, but uses **direct HTTP** for downloading the actual flyer page images (which are static CDN URLs from the spreads data). This is a key distinction from `ScreenshotOCRScraper` where the browser captures the actual content.

### Flow

1. **Resolve Publitas URL** — subclass provides `getPublitasUrl()`. May use browser if URL is dynamic.
2. **Fetch `spreads.json`** — HTTP GET from resolved URL, returns spread objects with page image URLs
3. **Download flyer page images** — parallel HTTP downloads (max 3 concurrent), skip cover/back pages. Images are downloaded as `Buffer` (converted from the existing `publitasImages.ts` base64 output).
4. **Send to GeminiExtractor** — each page = one `ImageChunk`, natural page boundaries (no overlap needed)
5. **Merge results** — concatenate, deduplicate by title similarity across pages
6. **Enrich `image_url`** — Publitas may have product hotspot data with individual image URLs

### Overridable Methods

```typescript
class PublitasOCRScraper extends BaseScraper {
  abstract getPublitasUrl(): string | Promise<string>
  getSkipPages(): number[]           // Default: [0] (skip cover)
  getPromptHints(): string           // Extra context for Gemini
  needsBrowserForUrl(): boolean      // Default: false. Override to true if URL is dynamic.
}
```

### Subclass Examples

```typescript
class VomarScraper extends PublitasOCRScraper {
  needsBrowserForUrl() { return true }
  async getPublitasUrl() { /* navigate browser, resolve current folder URL */ }
}

class DekamarktScraper extends PublitasOCRScraper {
  getPublitasUrl() { return 'https://folder.dekamarkt.nl/...' }
}
```

### Advantages Over Screenshots

- Print-quality images — clean, high contrast, designed for readability
- Direct HTTP for page images — faster, no anti-bot for image downloads
- Natural page boundaries — no overlap/chunking needed
- Potential `image_url` enrichment from hotspot data

## Screenshot Pipeline (`ScreenshotOCRScraper`)

Handles self-hosted supermarket websites that require browser navigation.

### Flow

1. **Navigate** — uses BaseScraper's browser init (stealth, user agent rotation, cookie consent)
2. **Pre-screenshot interaction** — optional `beforeScreenshots(page)` override (click "Toon alle", dismiss overlays)
3. **Measure content** — get total page height via `page.evaluate()`, get viewport height, calculate chunk count
4. **Capture scrolling screenshots** — viewport-sized chunks, 20% overlap, capped at `maxChunks`
5. **Send to GeminiExtractor** — each chunk = one `ImageChunk` with index/total metadata
6. **Merge + deduplicate** — cross-chunk dedup by normalized title + `discount_price` + `unit_info`, then DB-level dedup via `scrape_hash`

### Scroll Configuration

```typescript
interface ScrollConfig {
  viewportWidth: number          // Default: 1280 (desktop width for best layout)
  viewportHeight: number         // Default: 800 (chunk height)
  overlapPercent: number         // Default: 0.2 (20% overlap between chunks)
  maxChunks: number              // Default: 25 (safety cap ~500 products max)
  scrollDelayMs: [number, number] // Default: [500, 1500] (random delay range, anti-bot)
}
```

### Overridable Methods

```typescript
class ScreenshotOCRScraper extends BaseScraper {
  abstract getTargetUrl(): string
  getBrowserType(): 'chromium' | 'firefox'    // Default: 'chromium'
  getScrollConfig(): ScrollConfig             // Default: see above
  getPromptHints(): string                    // Extra context for Gemini
  beforeScreenshots(page: Page): Promise<void> // Custom page interaction
}
```

**Note**: `getBrowserType()` is inherited from the modified `BaseScraper` (see BaseScraper Modifications section). `ScreenshotOCRScraper` does not need to override `initBrowser()`.

### Subclass Examples

```typescript
class DirkScraper extends ScreenshotOCRScraper {
  getTargetUrl() { return 'https://www.dirk.nl/aanbiedingen' }
}

class KruidvatScraper extends ScreenshotOCRScraper {
  getTargetUrl() { return 'https://www.kruidvat.nl/acties' }
  getBrowserType() { return 'firefox' }
}

class AldiScraper extends ScreenshotOCRScraper {
  getTargetUrl() { return 'https://www.aldi.nl/aanbiedingen' }
  beforeScreenshots(page) { /* click "Toon meer" if present */ }
}
```

### Two-Layer Deduplication

1. **Cross-chunk** (in ScreenshotOCRScraper) — catches overlap duplicates by matching normalized title + `discount_price` + `unit_info` (including unit_info prevents over-deduplication of different sizes at the same price)
2. **DB-level** (in BaseScraper) — `scrape_hash` UNIQUE constraint catches anything remaining

## Error Handling

### Core Philosophy

Graceful degradation. A single bad chunk or failed page should never kill the whole scrape run. Insert what you can, log what went wrong, move on.

**Interaction with BaseScraper retry**: OCR scrapers handle chunk-level retries internally. `scrapeProducts()` never throws on partial failure — it returns successfully with whatever products were extracted. The outer `retryOperation()` in `BaseScraper.run()` only triggers on complete failures (browser crash, network unreachable, etc.).

### GeminiExtractor Errors

| Error | Response |
|---|---|
| Rate limit (429) | Rotate to next API key. If all keys exhausted, exponential backoff: 2s → 4s → 8s, max 2 retries, then skip chunk |
| Invalid JSON response | Retry once with stricter prompt, then skip chunk and log raw response |
| Empty results (0 products) | Log as info (could be blank/ad page). Warn if ALL chunks return 0 |
| API key invalid / model unavailable | Fail fast, no retry. Abort this supermarket, others continue |

### PublitasOCRScraper Errors

| Error | Response |
|---|---|
| `spreads.json` fetch fails | Retry once. If 404, log error (folder URL likely changed) |
| Flyer image download fails | Skip that page, continue with others. Partial results inserted |
| Dynamic URL resolution fails (browser) | Log error, abort this supermarket |

### ScreenshotOCRScraper Errors

| Error | Response |
|---|---|
| Page load/navigation fails | Inherited BaseScraper retry (3 attempts). Screenshot on error |
| Scroll height = 0 | Wait 3s, retry once. If still 0, abort this supermarket |
| `beforeScreenshots()` fails | Log warning, continue with whatever is visible |

### Logging

Uses existing `scrape_logs` table. The `ScrapeResult` interface is extended to support a `status` field:

```typescript
type ScrapeStatus = 'success' | 'partial' | 'failed';  // Shared with ScrapeLog

interface ScrapeResult {
  success: boolean
  status: ScrapeStatus           // NEW — replaces binary success mapping
  supermarket_slug: string
  products_scraped: number
  products_inserted: number
  products_updated: number
  duration_seconds: number
  error_message?: string
  error_screenshot_path?: string
  // NEW — OCR metadata
  metadata?: {
    chunks_processed: number
    chunks_failed: number
    pipeline_type: 'publitas' | 'screenshot' | 'api'
    gemini_tokens_used: number
  }
}
```

**Modified file**: `database/scrapeLogs.ts` — `createScrapeLog()` updated to use `result.status` instead of `result.success ? 'success' : 'failed'`. The `success` boolean is kept for backward compatibility with API scrapers.

Status mapping:

- **`success`** — all chunks processed, products inserted
- **`partial`** — some chunks succeeded, some failed. Successful products still inserted
- **`failed`** — zero products extracted

Additional metadata stored as JSON in `error_message` field for successful/partial scrapes:

```json
{
  "chunks_processed": 10,
  "chunks_failed": 1,
  "pipeline_type": "screenshot",
  "gemini_tokens_used": 12500
}
```

## Category Slug Alignment

### Current State (Mismatch)

The `CategorySlug` type in `packages/shared/src/types/Category.ts` defines **17** slugs:

`vers-gebak`, `vlees-vis-vega`, `zuivel-eieren`, `groente-fruit`, `diepvries`, `dranken`, `bewaren`, `ontbijt`, `snoep-chips`, `persoonlijke-verzorging`, `huishouden`, `baby-kind`, `elektronica`, `wonen-keuken`, `sport-vrije-tijd`, `kleding-mode`, `overig`

But the database seed data only has **12** categories (missing: `baby-kind`, `elektronica`, `wonen-keuken`, `sport-vrije-tijd`, `kleding-mode`).

The existing `ocrClient.ts` uses yet another set of categories that don't match either.

### Resolution

1. **New migration** adds the 5 missing categories to the database:
   - `baby-kind` (Baby & Kind)
   - `elektronica` (Elektronica)
   - `wonen-keuken` (Wonen & Keuken)
   - `sport-vrije-tijd` (Sport & Vrije Tijd)
   - `kleding-mode` (Kleding & Mode)

2. **GeminiExtractor prompt** uses all **17** category slugs — Gemini can now classify into any of them.

3. **responseParser** validates `category_slug` against the full 17-slug set. Unknown values → `'overig'`.

Migration file: `supabase/migrations/20260315000001_add_missing_categories.sql`

## Environment Configuration

### New Environment Variables

```env
# Required — comma-separated for multi-key pool
GEMINI_API_KEYS=key1,key2,key3

# Optional tuning
GEMINI_MODEL=gemini-3.1-flash-lite-preview
GEMINI_MAX_CONCURRENT=3
GEMINI_TEMPERATURE=0.1
```

Added to:
- Root `.env` and `.env.example`
- `packages/scraper/.env` and `.env.example`
- GitHub Actions secrets: `GEMINI_API_KEYS`
- `.github/workflows/scrape-daily.yml` — add `GEMINI_API_KEYS: ${{ secrets.GEMINI_API_KEYS }}` to the scrape job env block

### New Dependencies

```json
{
  "@google/generative-ai": "^0.21.0",
  "p-limit": "^6.0.0"
}
```

Added to `packages/scraper/package.json`. Pin to specific minor versions, not `^latest`.

## GitHub Actions Workflow Changes

`.github/workflows/scrape-daily.yml` requires:

1. **New environment variable** in the scrape job:
   ```yaml
   GEMINI_API_KEYS: ${{ secrets.GEMINI_API_KEYS }}
   ```

2. **New GitHub Secret**: `GEMINI_API_KEYS` (comma-separated API keys)

3. **Firefox installation** — already handled by the existing matrix (Firefox jobs install Firefox). No changes needed.

4. **No matrix changes** — each supermarket remains its own job. The scraper code internally decides which pipeline to use.

## File Structure

### New Files

```
packages/scraper/src/
├── gemini/
│   ├── GeminiExtractor.ts        // Core service: image → ExtractionResult
│   ├── keyPool.ts                // Round-robin API key pool (ported from ocrClient.ts)
│   ├── prompt.ts                 // Prompt template + builder
│   ├── responseParser.ts         // JSON parsing + validation + type coercion + date fallback
│   └── types.ts                  // ImageChunk, ExtractionContext, GeminiConfig, ExtractionResult
│
├── scrapers/base/
│   ├── PublitasOCRScraper.ts     // Base for Publitas supermarkets
│   └── ScreenshotOCRScraper.ts  // Base for screenshot supermarkets
│
supabase/migrations/
└── 20260315000001_add_missing_categories.sql  // Add 5 missing category rows
```

### Modified Files

| File | Change |
|---|---|
| `BaseScraper.ts` | Add `getBrowserType()` method, parameterize `initBrowser()` |
| `database/scrapeLogs.ts` | Support `status` field in `ScrapeResult`, map to `'partial'` |
| `ocr/publitasImages.ts` | Add `downloadImageAsBuffer()` method (wraps existing base64 with `Buffer.from()`) |
| `index.ts` | Register new scraper instances |
| `config/constants.ts` | Add `GEMINI_API_KEYS` env loading |
| `.github/workflows/scrape-daily.yml` | Add `GEMINI_API_KEYS` env var |
| Root `.env` and `.env.example` | Add Gemini env vars |
| `packages/scraper/.env.example` | Add Gemini env vars |
| `packages/scraper/package.json` | Add `@google/generative-ai`, `p-limit` |
| `packages/shared/src/types/ScrapedProduct.ts` | Add `status` to `ScrapeResult` |

### Rewritten Files (extend new base classes)

All browser-based scrapers rewritten to extend `PublitasOCRScraper` or `ScreenshotOCRScraper`. Each becomes ~20-40 lines of config instead of 200-600 lines of selector logic.

### Deleted Files

- All `selectors.ts` files (CSS selectors no longer needed)
- `ocr/ocrClient.ts` (logic ported to `gemini/GeminiExtractor.ts` and `gemini/keyPool.ts`)
- `ocr/ocrValidator.ts` (validation moves into `gemini/responseParser.ts`)
- `ocr/.env` (old per-key env file; keys move to main scraper `.env` as `GEMINI_API_KEYS`)

### Unchanged Files

- `AHScraper.ts` — API-only, no OCR needed
- `PicnicScraper.ts` — API-only, no OCR needed
- `database/products.ts` — insertion logic unchanged
- `utils/imageProcessor.ts` — image optimization unchanged

## Cost Estimate

### Per Daily Run

| Pipeline | Images/day | Notes |
|---|---|---|
| Publitas | ~40 | ~20 flyer pages × 2 supermarkets |
| Screenshot | ~100 | ~10 chunks avg × 10 supermarkets |
| Retries (~20%) | ~28 | Rate limits, JSON parse failures |
| **Total** | **~168** | |

### Monthly Cost

`gemini-3.1-flash-lite-preview` is one of the cheapest Gemini models. Estimated **$15-25/month** at ~168 images/day (base + retries). Actual cost depends on image resolution and token consumption per image (~250-500 input tokens).

## Testing Strategy

### 1. Unit Tests (`packages/scraper/src/gemini/__tests__/`)

Mocked Gemini API — no API key needed, fast, CI-safe.

- `responseParser.test.ts` — valid JSON, malformed JSON, missing fields, Dutch price/date coercion, date fallback to current week, category slug validation
- `prompt.test.ts` — field definitions present, all 17 category slugs injected, hints appended
- `keyPool.test.ts` — round-robin rotation, key cooldown on 429, expiration tracking
- `GeminiExtractor.test.ts` — rate limit retries with key rotation, partial chunk failure, concurrent limit via p-limit

### 2. Integration Tests (per pipeline)

Real API calls — requires `GEMINI_API_KEYS`, skipped in CI unless key is set.

- `PublitasOCRScraper.integration.test.ts` — fetch real Vomar spreads.json, send 1 page to Gemini
- `ScreenshotOCRScraper.integration.test.ts` — screenshot real Dirk page, send 1 chunk to Gemini

### 3. Validation Tests (data quality)

- Does Gemini find at least 80% of expected products from a known flyer?
- Are prices in range (€0.10 – €50)?
- Are dates in the current/next week?
- Are `category_slug` values from the valid 17-slug set?
- Compare OCR output vs existing AH API scraper output (ground truth signal)

### 4. CI Smoke Test

- Unit tests run on every PR (no API key needed)
- Integration tests skipped unless `GEMINI_API_KEYS` is set

### Development CLI Flags

```bash
# Test OCR on a single screenshot — no DB insertion
npm run scrape -- --supermarket=dirk --test-ocr

# Full pipeline, skip DB — print ScrapedProduct[] to console
npm run scrape -- --supermarket=dirk --dry-run

# Run old + new side by side, print diff (migration tool, temporary)
npm run scrape -- --supermarket=dirk --compare
```

## ScrapedProduct Field Reference

For completeness, the full `ScrapedProduct` interface that Gemini output maps to:

```typescript
interface ScrapedProduct {
  title: string                    // Required — product name
  description?: string             // Optional — product description
  original_price?: number          // Optional — price before discount
  discount_price: number           // Required — sale price in EUR
  discount_percentage?: number     // Optional — 0-100
  image_url?: string               // Optional — product image URL
  product_url?: string             // Optional — link to product page
  unit_info?: string               // Optional — "per kg", "500g", etc.
  valid_from: Date                 // Required — discount start date (fallback: current Monday)
  valid_until: Date                // Required — discount end date (fallback: current Sunday)
  category_slug?: string           // Optional — one of 17 valid slugs
  requires_card?: boolean          // Optional — loyalty card needed
}
```

## Database Impact

### Schema Changes

One new migration: `20260315000001_add_missing_categories.sql`

```sql
INSERT INTO categories (name, slug, icon_name) VALUES
  ('Baby & Kind', 'baby-kind', 'baby-carriage'),
  ('Elektronica', 'elektronica', 'laptop'),
  ('Wonen & Keuken', 'wonen-keuken', 'silverware-fork-knife'),
  ('Sport & Vrije Tijd', 'sport-vrije-tijd', 'run'),
  ('Kleding & Mode', 'kleding-mode', 'tshirt-crew')
ON CONFLICT (slug) DO NOTHING;
```

### No Other Schema Changes

The existing `products` table, `scrape_logs` table, and all indexes/constraints work as-is. The `ScrapedProduct` → DB insertion pipeline in `database/products.ts` is unchanged.

The `requires_card` column is still not in the DB migrations — the existing fallback logic (insert with field, catch error, retry without) continues to work.

## Future Considerations (Not In Scope)

- **Supabase Storage pipeline**: Screenshots uploaded to temp storage bucket → Gemini → delete. Decouples capture from processing, adds observability.
- **Boni scraper**: Confirmed on Publitas, can be added as a new `PublitasOCRScraper` subclass.
- **Jumbo Publitas verification**: If confirmed, move from Screenshot to Publitas pipeline.
- **`requires_card` migration**: Add column to DB schema for clean storage.
- **Lidl scraper**: Re-add if needed, using ScreenshotOCRScraper.
- **Plus scraper**: Add if supermarket row is seeded and URL is known.

## Review Fixes Log (Rev 2)

Issues addressed from spec review:

| ID | Severity | Fix |
|---|---|---|
| C1 | Critical | Added "BaseScraper Modifications" section — `getBrowserType()` added to BaseScraper |
| C2 | Critical | Clarified PublitasOCRScraper browser usage — may use browser for URL resolution |
| C3 | Critical | Added "Category Slug Alignment" section — migration for 5 missing categories, all 17 slugs used |
| M1 | Major | GeminiExtractor uses multi-key pool (ported from ocrClient.ts), added `keyPool.ts` |
| M2 | Major | `publitasImages.ts` listed as modified file — add `downloadImageAsBuffer()` method |
| M3 | Major | Jumbo defaults to Screenshot pipeline, moves to Publitas only if verified |
| M4 | Major | Added "Supermarkets Not Covered" section for Plus and Lidl |
| M5 | Major | Extended `ScrapeResult` with `status` field, `scrapeLogs.ts` listed as modified |
| M6 | Major | Documented BaseScraper.run() retry interaction — OCR scrapers never throw on partial |
| M7 | Major | Added date fallback strategy (null → current week Monday/Sunday) |
| m1 | Minor | Dependency version pinned to `^0.21.0` / `^6.0.0` |
| m2 | Minor | Cost estimate now includes ~20% retry overhead |
| m3 | Minor | ScrollConfig uses proper TypeScript types with defaults documented separately |
| m4 | Minor | Cross-chunk dedup includes `unit_info` to prevent over-deduplication |
| m5 | Minor | Added "GitHub Actions Workflow Changes" section |
| m6 | Minor | Concurrent pool specified as `p-limit` with explicit dependency |
