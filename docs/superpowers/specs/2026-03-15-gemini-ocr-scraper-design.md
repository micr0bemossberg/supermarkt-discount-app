# Gemini OCR Scraper Design Spec

**Date**: 2026-03-15
**Branch**: `feature/gemini-ocr-scraper`
**Status**: Draft

## Problem

The current scraper architecture relies on CSS selectors to extract product data from supermarket websites. These selectors are the most fragile part of the system — they break whenever a site redesigns its HTML. There are 14 individual scraper classes, each with hundreds of lines of selector logic that require constant maintenance.

## Solution

Replace CSS-selector-based extraction with Gemini Vision OCR (`gemini-3.1-flash-lite-preview`). Instead of parsing DOM elements, we capture visual representations of discount pages (flyer images or screenshots) and let Gemini extract structured product data from them.

## Architecture Overview

Three distinct input pipelines feed a shared `GeminiExtractor` service:

```
BaseScraper (existing, untouched)
│
│  ┌─────────────────────────────────────────────────┐
│  │         GeminiExtractor (shared service)         │
│  │  - Accepts image Buffer(s)                       │
│  │  - Sends to gemini-3.1-flash-lite-preview        │
│  │  - Structured JSON prompt → ScrapedProduct[]     │
│  │  - Concurrent worker pool (rate-limited)         │
│  └──────────┬──────────────┬──────────────┬─────────┘
│             │              │              │
│     ┌───────┴───┐   ┌─────┴─────┐   ┌────┴────┐
│     │ Publitas  │   │Screenshot │   │  API    │
│     │ Pipeline  │   │ Pipeline  │   │Pipeline │
│     └───────────┘   └───────────┘   └─────────┘
│
├── PublitasOCRScraper (extends BaseScraper)
│   ├── VomarScraper
│   ├── DekamarktScraper
│   ├── BoniScraper (future)
│   └── JumboScraper (if confirmed Publitas)
│
├── ScreenshotOCRScraper (extends BaseScraper)
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
| Jumbo | Publitas (TBD) | Likely Publitas, needs verification |
| Dirk | Screenshot | Self-hosted Vue.js app |
| Hoogvliet | Screenshot | Self-hosted Intershop platform |
| Aldi | Screenshot | Self-hosted Next.js + Algolia |
| Action | Screenshot | Self-hosted Next.js |
| Kruidvat | Screenshot | Heavy anti-bot, Firefox required |
| Joybuy | Screenshot | Firefox required |
| Flink | Screenshot | Self-hosted |
| Megafoodstunter | Screenshot | Self-hosted |
| Butlon | Screenshot | Self-hosted |
| Albert Heijn | API (unchanged) | Mobile API returns structured data |
| Picnic | API (unchanged) | REST API returns structured data |

## GeminiExtractor Service

The shared service that converts images into structured product data.

### Interface

```typescript
class GeminiExtractor {
  constructor(apiKey: string, modelId?: string)

  extractProducts(
    images: ImageChunk[],
    context: ExtractionContext
  ): Promise<ScrapedProduct[]>
}

interface ImageChunk {
  buffer: Buffer        // Image data (screenshot or flyer page)
  index: number         // Order in sequence
  totalChunks: number   // "Page 3 of 12" — helps Gemini understand scope
}

interface ExtractionContext {
  supermarketSlug: string      // Which supermarket (e.g., "dirk")
  supermarketName: string      // Human-readable (e.g., "Dirk van den Broek")
  categorySlugList: string[]   // The 12 valid category slugs
  promptHints?: string         // Per-supermarket extra instructions
}
```

### What Gemini Extracts (All Fields From Image)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | `string` | YES | Product name |
| `discount_price` | `number` | YES | Sale price in EUR |
| `original_price` | `number` | no | Price before discount |
| `discount_percentage` | `number` | no | Read from badges like "25% KORTING" |
| `description` | `string` | no | Subtitle, variant info |
| `unit_info` | `string` | no | "per kg", "500g", "2 voor €3" |
| `valid_from` | `Date` | YES | Extracted from "Geldig van..." text on flyer |
| `valid_until` | `Date` | YES | Extracted from "...t/m zondag" text on flyer |
| `category_slug` | `string` | no | Classified from visual context + valid slug list |
| `requires_card` | `boolean` | no | Spotted from loyalty badges (Bonuskaart, etc.) |
| `image_url` | `string` | no | Usually null from screenshots; Publitas may provide |
| `product_url` | `string` | no | Usually null from OCR |

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
const GEMINI_CONFIG = {
  MODEL_ID: 'gemini-3.1-flash-lite-preview',
  MAX_CONCURRENT: 3,
  RETRY_ATTEMPTS: 2,
  TEMPERATURE: 0.1,
}
```

### Prompt Strategy

The prompt instructs Gemini to:

1. Act as a Dutch supermarket discount data extractor
2. Return a JSON array matching the `ScrapedProduct` schema
3. Extract dates from visual context ("Geldig van/t/m..." headers)
4. Classify products into one of the 12 provided category slugs
5. Spot loyalty card requirements from badges
6. Use the Google AI SDK's `responseSchema` to enforce valid JSON structure

### Response Parsing

`responseParser.ts` handles:

- JSON.parse with error recovery
- Type coercion: string prices `"1,99"` → `1.99`, Dutch dates → `Date` objects
- Required field validation: products without `title` or `discount_price` are filtered out
- Price sanity checks: `discount_price` must be > 0, `original_price` >= `discount_price`

### Internal Components

```
packages/scraper/src/gemini/
├── GeminiExtractor.ts     // Core service: image → ScrapedProduct[]
├── prompt.ts              // Prompt template + builder
├── responseParser.ts      // JSON parsing + validation + type coercion
└── types.ts               // ImageChunk, ExtractionContext, GeminiConfig
```

## Publitas Pipeline (`PublitasOCRScraper`)

Handles supermarkets whose flyers are hosted on Publitas. No browser needed.

### Flow

1. **Resolve Publitas URL** — subclass provides `getPublitasUrl()`
2. **Fetch `spreads.json`** — HTTP GET, returns array of spread objects with page image URLs
3. **Download flyer page images** — parallel (max 3 concurrent), skip cover/back pages
4. **Send to GeminiExtractor** — each page = one `ImageChunk`, natural page boundaries (no overlap needed)
5. **Merge results** — concatenate, deduplicate by title similarity across pages
6. **Enrich `image_url`** — Publitas may have product hotspot data with individual image URLs

### Overridable Methods

```typescript
class PublitasOCRScraper extends BaseScraper {
  abstract getPublitasUrl(): string | Promise<string>
  getSkipPages(): number[]           // Default: [0] (skip cover)
  getPromptHints(): string           // Extra context for Gemini
}
```

### Subclass Examples

```typescript
class VomarScraper extends PublitasOCRScraper {
  getPublitasUrl() { /* resolve current Vomar folder URL */ }
}

class DekamarktScraper extends PublitasOCRScraper {
  getPublitasUrl() { return 'https://folder.dekamarkt.nl/...' }
}
```

### Advantages Over Screenshots

- Print-quality images — clean, high contrast, designed for readability
- No browser needed — faster, no anti-bot, no cookie consent
- Natural page boundaries — no overlap/chunking needed
- Potential `image_url` enrichment from hotspot data

## Screenshot Pipeline (`ScreenshotOCRScraper`)

Handles self-hosted supermarket websites that require browser navigation.

### Flow

1. **Navigate** — uses BaseScraper's browser init (stealth, user agent rotation, cookie consent)
2. **Pre-screenshot interaction** — optional `beforeScreenshots(page)` override (click "Toon alle", dismiss overlays)
3. **Measure content** — get total page height, viewport height, calculate chunk count
4. **Capture scrolling screenshots** — viewport-sized chunks, 20% overlap, capped at `maxChunks`
5. **Send to GeminiExtractor** — each chunk = one `ImageChunk` with index/total metadata
6. **Merge + deduplicate** — cross-chunk dedup by normalized title + price, then DB-level dedup via `scrape_hash`

### Scroll Configuration

```typescript
interface ScrollConfig {
  viewportWidth: 1280        // Desktop width for best layout
  viewportHeight: 800        // Chunk height
  overlapPercent: 0.2        // 20% overlap between chunks
  maxChunks: 25              // Safety cap (~500 products max)
  scrollDelayMs: [500, 1500] // Random delay range (anti-bot)
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

1. **Cross-chunk** (in ScreenshotOCRScraper) — catches overlap duplicates by matching normalized title + `discount_price`
2. **DB-level** (in BaseScraper) — `scrape_hash` UNIQUE constraint catches anything remaining

## Error Handling

### Core Philosophy

Graceful degradation. A single bad chunk or failed page should never kill the whole scrape run. Insert what you can, log what went wrong, move on.

### GeminiExtractor Errors

| Error | Response |
|---|---|
| Rate limit (429) | Exponential backoff: 2s → 4s → 8s, max 2 retries, then skip chunk |
| Invalid JSON response | Retry once with stricter prompt, then skip chunk and log raw response |
| Empty results (0 products) | Log as info (could be blank/ad page). Warn if ALL chunks return 0 |
| API key invalid / model unavailable | Fail fast, no retry. Abort this supermarket, others continue |

### PublitasOCRScraper Errors

| Error | Response |
|---|---|
| `spreads.json` fetch fails | Retry once. If 404, log error (folder URL likely changed) |
| Flyer image download fails | Skip that page, continue with others. Partial results inserted |

### ScreenshotOCRScraper Errors

| Error | Response |
|---|---|
| Page load/navigation fails | Inherited BaseScraper retry (3 attempts). Screenshot on error |
| Scroll height = 0 | Wait 3s, retry once. If still 0, abort this supermarket |
| `beforeScreenshots()` fails | Log warning, continue with whatever is visible |

### Logging

Uses existing `scrape_logs` table. Status mapping:

- **`success`** — all chunks processed, products inserted
- **`partial`** — some chunks succeeded, some failed. Successful products still inserted
- **`failed`** — zero products extracted

Additional metadata stored as JSON in `error_message` field:

```json
{
  "chunks_processed": 10,
  "chunks_failed": 1,
  "pipeline_type": "screenshot",
  "gemini_tokens_used": 12500
}
```

## Environment Configuration

### New Environment Variables

```env
# Required
GEMINI_API_KEY=your-gemini-api-key-here

# Optional tuning
GEMINI_MODEL=gemini-3.1-flash-lite-preview
GEMINI_MAX_CONCURRENT=3
GEMINI_TEMPERATURE=0.1
```

Added to:
- Root `.env` and `.env.example`
- `packages/scraper/.env` and `.env.example`
- GitHub Actions secrets: `GEMINI_API_KEY`

### New Dependencies

```json
{
  "@google/generative-ai": "^latest"
}
```

Single new dependency added to `packages/scraper/package.json`.

## File Structure

### New Files

```
packages/scraper/src/
├── gemini/
│   ├── GeminiExtractor.ts        // Core extraction service
│   ├── prompt.ts                 // Prompt template + builder
│   ├── responseParser.ts         // JSON parsing + validation
│   └── types.ts                  // ImageChunk, ExtractionContext, etc.
│
├── scrapers/base/
│   ├── PublitasOCRScraper.ts     // Base for Publitas supermarkets
│   └── ScreenshotOCRScraper.ts  // Base for screenshot supermarkets
```

### Rewritten Files (extend new base classes)

All browser-based scrapers rewritten to extend `PublitasOCRScraper` or `ScreenshotOCRScraper`. Each becomes ~20-40 lines of config instead of 200-600 lines of selector logic.

### Deleted Files

- All `selectors.ts` files (CSS selectors no longer needed)
- `ocr/ocrClient.ts` (replaced by GeminiExtractor)
- `ocr/ocrValidator.ts` (validation moves into responseParser)

### Unchanged Files

- `BaseScraper.ts` — foundation untouched
- `AHScraper.ts` — API-only, no OCR needed
- `PicnicScraper.ts` — API-only, no OCR needed
- `database/products.ts` — insertion logic unchanged
- `utils/imageProcessor.ts` — image optimization unchanged
- `config/constants.ts` — supermarket URLs remain
- `ocr/publitasImages.ts` — reused by PublitasOCRScraper
- `index.ts` — updated to register new scraper instances

## Cost Estimate

### Per Daily Run

| Pipeline | Images/day | Notes |
|---|---|---|
| Publitas | ~40 | ~20 flyer pages × 2 supermarkets |
| Screenshot | ~100 | ~10 chunks avg × 10 supermarkets |
| **Total** | **~140** | |

### Monthly Cost

`gemini-3.1-flash-lite-preview` is one of the cheapest Gemini models. Estimated **$10-20/month** at ~140 images/day including retries.

## Testing Strategy

### 1. Unit Tests (`packages/scraper/src/gemini/__tests__/`)

Mocked Gemini API — no API key needed, fast, CI-safe.

- `responseParser.test.ts` — valid JSON, malformed JSON, missing fields, Dutch price/date coercion
- `prompt.test.ts` — field definitions present, category slugs injected, hints appended
- `GeminiExtractor.test.ts` — rate limit retries, partial chunk failure, concurrent limit

### 2. Integration Tests (per pipeline)

Real API calls — requires `GEMINI_API_KEY`, skipped in CI unless key is set.

- `PublitasOCRScraper.integration.test.ts` — fetch real Vomar spreads.json, send 1 page to Gemini
- `ScreenshotOCRScraper.integration.test.ts` — screenshot real Dirk page, send 1 chunk to Gemini

### 3. Validation Tests (data quality)

- Does Gemini find at least 80% of expected products from a known flyer?
- Are prices in range (€0.10 – €50)?
- Are dates in the current/next week?
- Are `category_slug` values from the valid set?
- Compare OCR output vs existing AH API scraper output (ground truth signal)

### 4. CI Smoke Test

- Unit tests run on every PR (no API key needed)
- Integration tests skipped unless `GEMINI_API_KEY` is set

### Development CLI Flags

```bash
# Test OCR on a single screenshot — no DB insertion
npm run scrape -- --supermarket=dirk --test-ocr

# Full pipeline, skip DB — print ScrapedProduct[] to console
npm run scrape -- --supermarket=dirk --dry-run

# Run old + new side by side, print diff (migration tool)
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
  valid_from: Date                 // Required — discount start date
  valid_until: Date                // Required — discount end date
  category_slug?: string           // Optional — one of 12 valid slugs
  requires_card?: boolean          // Optional — loyalty card needed
}
```

## Database Impact

No schema changes required. The existing `products` table, `scrape_logs` table, and all indexes/constraints work as-is. The `ScrapedProduct` → DB insertion pipeline in `database/products.ts` is unchanged.

The `requires_card` column is still not in the DB migrations — the existing fallback logic (insert with field, catch error, retry without) continues to work.

## Future Considerations (Not In Scope)

- **Supabase Storage pipeline**: Screenshots uploaded to temp storage bucket → Gemini → delete. Decouples capture from processing, adds observability.
- **Boni scraper**: Confirmed on Publitas, can be added as a new `PublitasOCRScraper` subclass.
- **Jumbo Publitas verification**: Needs manual check to confirm Publitas usage.
- **`requires_card` migration**: Add column to DB schema for clean storage.
