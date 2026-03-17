# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Dutch Supermarket Discount Aggregator consisting of:
- **Mobile App**: Expo React Native app for browsing supermarket discounts
- **Scraper**: Gemini Vision OCR-based scraper that runs on GitHub Actions daily
- **Backend**: Supabase (PostgreSQL + Storage + REST API)
- **Shared**: Common TypeScript types used across packages

## Common Commands

### Workspace Commands (from root)

```bash
npm install          # Install all dependencies for all packages
npm run scraper      # Run scraper
npm run mobile       # Run mobile app
npm run test         # Run tests across all workspaces
npm run lint         # Run linters across all workspaces
```

### Scraper Commands

```bash
cd packages/scraper

npx playwright install chromium    # Required once before first run
npx playwright install firefox     # Required for kruidvat / joybuy

# Run a specific supermarket
npm run scrape -- --supermarket=dirk
npm run scrape -- --supermarket=ah
# ... (all slugs: ah, jumbo, aldi, dirk, vomar, hoogvliet, action, dekamarkt,
#      kruidvat, picnic, joybuy, megafoodstunter, butlon, flink)

npm run scrape -- all           # Run all scrapers
npm run scrape -- cleanup       # Deactivate expired products

# OCR development/testing (no DB writes)
npm run scrape -- --supermarket=dirk --test-ocr                     # Single chunk OCR test
npm run scrape -- --supermarket=dirk --test-ocr --output=out.json   # Save clean JSON
npm run scrape -- --supermarket=dirk --dry-run                      # Full pipeline, no DB

HEADLESS=false npm run scrape -- --supermarket=dirk   # Visible browser

npm run build    # Build TypeScript
npm run clean    # Clean generated files

# Run unit tests
npx jest src/gemini/ --no-cache    # 30 tests for OCR extraction pipeline
```

### Mobile App Commands

```bash
cd packages/mobile-app

npm start                     # Start Expo dev server
npx expo start --android      # Start with Android
npm run type-check            # TypeScript check without emitting
npm run lint                  # Lint code
npm run build:android         # Production APK via EAS
npm run build:preview         # Preview APK via EAS
npm start -- --clear          # Clear cache and restart
```

## Architecture

### Monorepo Structure

npm workspaces monorepo with three packages:
- `packages/scraper`    — Node.js scraper (Playwright + Gemini OCR + Supabase)
- `packages/mobile-app` — Expo React Native app (React Native Paper, Zustand)
- `packages/shared`     — TypeScript types shared between both packages

All packages reference shared types via `@supermarkt-deals/shared`.

### Scraper Architecture — Gemini Vision OCR

The scraper uses **Gemini Vision OCR** (`gemini-3.1-flash-lite-preview`) instead of CSS selectors. Three pipelines feed a shared `GeminiExtractor` service:

**GeminiExtractor** (`packages/scraper/src/gemini/`):
- Core service: images → structured `ScrapedProduct[]` via Google AI SDK
- 10-key round-robin API pool with per-key cooldown
- Structured output (JSON schema enforcement) — guarantees valid JSON
- Thinking mode (`low`) for step-by-step price/date reasoning
- Media resolution `HIGH` (1120 tokens/image) for reading small print
- Batch processing with rate limit delays (free tier: 15 RPM per project)

**Pipeline 1 — PublitasOCRScraper** (flyer-based supermarkets):
- Fetches `spreads.json` from Publitas CDN → downloads flyer page images
- No browser needed for image extraction (may need browser for URL resolution)
- Supermarkets: **Vomar**, **DekaMarkt**

**Pipeline 2 — ScreenshotOCRScraper** (self-hosted websites):
- Playwright navigates, handles cookies, takes scrolling screenshots with 20% overlap
- `beforeScreenshots()` hook for page interaction (expand cards, click tabs, load more)
- Supermarkets: **Dirk**, **Hoogvliet**, **Aldi**, **Action**, **Kruidvat** (Firefox), **Joybuy** (Firefox), **Flink**, **Megafoodstunter**, **Butlon**, **Jumbo**

**Pipeline 3 — API scrapers** (unchanged, no OCR):
- **AHScraper** — Albert Heijn mobile API
- **PicnicScraper** — Picnic REST API

**BaseScraper** (`packages/scraper/src/scrapers/base/BaseScraper.ts`):
- Browser init with Playwright (supports Chromium and Firefox via `getBrowserType()`)
- Anti-bot: random user agents, stealth mode, cookie consent
- Retry logic with exponential backoff (3 attempts)
- Image processing: download → WebP optimization → Supabase Storage upload
- DB insertion with dedup via `scrape_hash` (SHA-256)

**Adding a new scraper**:
1. Create `packages/scraper/src/scrapers/{name}/{Name}Scraper.ts`
2. Extend `ScreenshotOCRScraper` (for websites) or `PublitasOCRScraper` (for Publitas flyers)
3. Implement `getTargetUrl()`, `getSupermarketName()`, and optionally `beforeScreenshots()`, `getPromptHints()`, `getBrowserType()`
4. Register in `packages/scraper/src/index.ts`
5. Add slug to `SupermarketSlug` in `packages/shared/src/types/Supermarket.ts`
6. Add to seed data in `supabase/migrations/`

### Dirk-Specific Behavior

Dirk has unique features requiring special handling:
- **Multi-product cards**: Products with variants (e.g., "Gesneden fruit" → Meloenmix + Fruitsalade) have an expand arrow (`.middle-item.multi-product`). Clicking opens a modal overlay showing individual variants with prices/weights. Close via `button.close[aria-label="Sluiten"]`.
- **Two tabs**: "Aanbiedingen tot en met dinsdag" (current) and "Aanbiedingen vanaf woensdag" (upcoming). Both are scraped via `button.upcoming` tab click.
- **Weekend deals**: "VR, ZA & ZO ACTIE" badges mean Friday-Sunday validity only.

### Mobile App Architecture

**State Management** (Zustand stores in `src/stores/`):
- `productsStore.ts` — products fetching, filtering, pagination
- `favoritesStore.ts` — local favorites (AsyncStorage)
- `settingsStore.ts` — app settings (theme, preferences)
- `groceryListStore.ts` — grocery list management

**Services Layer** (`src/services/`):
- `products.ts` — product queries to Supabase
- `supermarkets.ts` — supermarket data
- `groceryMatcher.ts` — matches grocery items to available deals
- `routePlanner.ts` — optimal store route planning
- `shoppingPlanOptimizer.ts` — optimizes shopping trips across stores

**Navigation**:
- Stack: `MainTabs`, `ProductDetail`, `Search`, `ShoppingPlan`
- Bottom tabs: `Home`, `GroceryList`, `Favorites`, `Settings`

### Database Schema

**Tables**:
- `supermarkets` — name, slug, logo_url, primary_color, is_online_only, is_active
- `categories` — name, slug, icon_name (17 categories)
- `products` — discount products with pricing, images, validity dates, deal_type
- `user_favorites` — requires Supabase Auth (not yet enabled in MVP)
- `scrape_logs` — scraper execution logs (supports `partial` status for OCR)

**Important Fields**:
- `products.scrape_hash` — SHA-256 deduplication (UNIQUE)
- `products.is_active` — products never deleted, only deactivated
- `products.valid_from` / `valid_until` — discount date range
- `products.deal_type` — discount type: korting, 1+1_gratis, 2e_halve_prijs, x_voor_y, weekend_actie, etc.
- `products.image_storage_path` — path in `product-images` Supabase Storage bucket

**Migrations** (run in order via Supabase SQL Editor):
1. `20260117000001_initial_schema.sql`
2. `20260117000002_seed_data.sql`
3. `20260117000003_rls_policies.sql`
4. `20260210000001_add_online_supermarkets.sql`
5. `20260210000002_remove_ochama_deactivate_others.sql`
6. `20260210000003_add_hoogvliet_action.sql`
7. `20260210000004_add_flink_kruidvat.sql`
8. `20260315000001_add_missing_categories.sql`
9. `20260315000002_add_deal_type_column.sql`

## Environment Variables

All env vars live in the root `.env` file (single source of truth). The scraper's `dotenv.config()` loads from monorepo root.

**Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
**Mobile App**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
**Picnic**: `PICNIC_EMAIL`, `PICNIC_PASSWORD`
**Gemini OCR**: `gemini_api_key1` through `gemini_api_key10` (10 keys, 15 RPM per project)

## CI/CD

Single GitHub Actions workflow: `.github/workflows/scrape-daily.yml`
- Runs daily at 05:00 UTC (07:00 CET)
- Matrix strategy: each supermarket runs as a separate parallel job
- Requires GitHub Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PICNIC_EMAIL`, `PICNIC_PASSWORD`, `gemini_api_key1..10`

## Key Files to Check When...

**Debugging OCR extraction**:
- `packages/scraper/src/gemini/prompt.ts` — the Gemini prompt (most impactful for accuracy)
- `packages/scraper/src/gemini/responseParser.ts` — JSON parsing, date fallback, validation
- `packages/scraper/src/gemini/types.ts` — `PRODUCT_EXTRACTION_SCHEMA` (structured output schema)
- Run `--test-ocr` to capture 1 screenshot and test extraction without DB writes

**Debugging a specific supermarket**:
- Check `packages/scraper/src/scrapers/{name}/{Name}Scraper.ts` — look at `beforeScreenshots()`, `getPromptHints()`
- Run with `HEADLESS=false` to watch the browser
- Check `./screenshots/` for error screenshots

**Modifying database schema**:
- Create new migration in `supabase/migrations/`
- Update types in `packages/shared/src/types/`
- Rebuild shared: `cd packages/shared && npx tsc`
- Update service functions if needed

## Gemini OCR Configuration

Located in `packages/scraper/src/gemini/types.ts` (`GEMINI_DEFAULTS`):
- **Model**: `gemini-3.1-flash-lite-preview` (free tier)
- **Thinking**: `low` — adds reasoning for price/date extraction (~3s per chunk)
- **Structured output**: JSON schema enforcement (guarantees valid output)
- **Media resolution**: `HIGH` (1120 tokens/image)
- **Temperature**: `0.0` (deterministic)
- **Batch size**: 14 chunks per batch, 65s delay between batches
- **Rate limit**: **15 RPM per Gmail account** (not per project — see below)

### Gemini API Key & Rate Limit Setup

- **10 API keys** on **10 separate Google Cloud projects** (project1 through project10)
- Keys created via https://aistudio.google.com/ → API Keys
- All keys on the same Gmail account, different projects, all Free tier
- **CRITICAL FINDING**: Despite separate projects, Google enforces **15 RPM per Gmail account on free tier**, NOT per project. The `quotaId` says "per project" but testing proves the limit is shared across all projects on the same account.
- This means 10 keys ≠ 150 RPM. Effective rate: **15 RPM total**.
- The 65s batch delay is calibrated for this: send 14 chunks, wait 65s for rate limit window to reset.
- Keys can expire — if `API_KEY_INVALID` errors appear, regenerate at https://aistudio.google.com/
- To get true 150 RPM: use 10 **different Gmail accounts** (each with its own project), or upgrade to Tier 1 billing.
- Env vars: `gemini_api_key1` through `gemini_api_key10` in root `.env`

## Supabase Notes

- **Auth**: Not enabled in MVP — mobile app uses anon key (read-only)
- **Storage**: Bucket `product-images` (public read) — path: `{slug}/{year}/{month}/{hash}.webp`
- **RLS**: Products/supermarkets/categories have public read; favorites requires auth
- Scraper uses `SUPABASE_SERVICE_KEY`; mobile app uses `SUPABASE_ANON_KEY`
