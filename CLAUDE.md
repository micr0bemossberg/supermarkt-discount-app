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
- 60-key slot-based dispatcher with dual-model fallback (flash-lite + flash)
- Structured output (JSON schema enforcement) — guarantees valid JSON
- Thinking mode (`high`) — free tier, max reasoning for best extraction accuracy
- Media resolution `HIGH` (1120 tokens/image) for reading small print
- Central dispatcher polls every 100ms, dispatches to free slots with escalating backoff on 429

**Pipeline 1 — PublitasOCRScraper** (flyer-based supermarkets):
- Fetches `spreads.json` from Publitas CDN → downloads flyer page images (print-quality, no browser needed)
- Publitas URLs redirect (e.g., `folder-deze-week` → `online-weekendfolder-week-12`) — scrapers follow redirect to get actual publication URL
- Spreads format: `spread.pages[0].images.at2400` (relative path, prefixed with `https://view.publitas.com`)
- Vomar needs browser to resolve Publitas iframe embed URL from `vomar.nl/aanbiedingen`
- Supermarkets: **Vomar** (219 products, 80s), **DekaMarkt** (69 products, 23s)

**Pipeline 2 — ScreenshotOCRScraper** (self-hosted websites):
- Playwright navigates, handles cookies, takes scrolling screenshots with 20% overlap
- `beforeScreenshots()` hook for page interaction (expand cards, click tabs, load more)
- `getWaitUntil()` override for sites that don't reach `networkidle` (e.g., Aldi uses `domcontentloaded`)
- `getBrowserType()` override for Firefox (Kruidvat, Joybuy — Chromium blocked by TLS fingerprinting)
- Supermarkets: **Dirk** (378 products, 8.5min), **Hoogvliet** (21, 250s), **Aldi** (48, 464s), **Action** (25, 161s), **Kruidvat** (Firefox), **Joybuy** (Firefox), **Flink**, **Megafoodstunter**, **Butlon**, **Jumbo**

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
3. Implement `getTargetUrl()`, `getSupermarketName()`, and optionally `beforeScreenshots()`, `getPromptHints()`, `getBrowserType()`, `getWaitUntil()`
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
- **Thinking**: `high` — free tier, max reasoning for best extraction accuracy
- **Structured output**: JSON schema enforcement (guarantees valid output)
- **Media resolution**: `HIGH` (1120 tokens/image) for reading small print prices
- **Temperature**: `0.0` (deterministic)
- **Dual-model fallback**: `gemini-3.1-flash-lite-preview` (primary, 15 RPM) + `gemini-3-flash-preview` (fallback, 5 RPM). Different models have separate rate limits per project.
- **Rate limit**: **~60 keys × 2 models = ~120 slots** across multiple Gmail accounts

### Gemini API Key & Rate Limit Setup

- **~60 API keys** across multiple Gmail accounts, each on a separate Google Cloud project
- Keys created via https://aistudio.google.com/ → API Keys
- Rate limits are **per project per model**: flash-lite: 15 RPM / 500 RPD, flash: 5 RPM / 20 RPD
- Keys can expire — if `API_KEY_INVALID` errors appear, regenerate at https://aistudio.google.com/
- Env vars: `gemini_api_key1` through `gemini_api_key60` in root `.env` (scanner supports up to 100)

### Key Pool & Rate Limit Architecture

The key pool (`packages/scraper/src/gemini/keyPool.ts`) manages API keys with a **slot-based dual-model dispatcher**:

**Slot model**: Each API key has 2 slots — one per model (flash-lite + flash). Rate limits are per-project per-model, so when flash-lite is 429'd, flash on the same key may still be available.

**Central dispatcher** (100ms polling loop in `GeminiExtractor.extractProducts()`):
1. Every 100ms, scan all slots for FREE ones (including rate-limited slots whose backoff expired)
2. For each FREE slot + chunk in queue → dispatch (fire-and-forget, key → IN-FLIGHT)
3. On success → slot FREE (backoff resets), products collected
4. On 429 → slot RATE_LIMITED with escalating backoff (15s → 30s → 60s → 60s...)
5. On `API_KEY_INVALID` → key DISABLED (all model slots for that key)
6. Loop ends when queue empty AND no slots in-flight

**Key states**: FREE (ready) → IN-FLIGHT (processing) → RATE_LIMITED (backoff timer) → FREE (timer expired). DISABLED = permanently dead.

**Rate limit lessons learned**:
- Google's free tier has **two rate limits**: RPM (15/min) AND a burst limiter (can't fire 15 requests in 1 second)
- **Do NOT spam 429'd keys** — Google escalates rate limits across ALL projects on the same Gmail account
- **500 RPD per project** (flash-lite) / **20 RPD** (flash) — daily limits reset at midnight Pacific
- **403 can mean rate limit**, not just auth error — only disable keys on `API_KEY_INVALID`
- Escalating backoff (15s → 30s → 60s) is critical — resets on success so recovered keys immediately get work
- No health checks needed — the backoff timer + real request attempt is sufficient

**Tested results** (60 keys × 2 models = 120 slots):
| Supermarket | Pipeline | Products | Chunks | Extraction Time |
|---|---|---|---|---|
| Dirk | Screenshot | 378 | 90/92 | 8.5 min | Working |
| Vomar | Publitas | 219 | 41/41 | 80s | Working |
| Kruidvat | Publitas | 181 | 54/54 | 846s | Working |
| DekaMarkt | Publitas | 69 | 16/16 | 23s | Working |
| Hoogvliet | Screenshot | 21→177* | 6→25* | 250s | Fixed (scroll-to-load) |
| Aldi | Screenshot | 48 | 25/25 | 464s | Working |
| Action | Screenshot | 25 | 10/10 | 161s | Working (OCR misses some) |
| Jumbo | Screenshot | 21 | 5/5 | 70s | Working |
| Megafoodstunter | Screenshot | 7 | 15/15 | 144s | Working |
| Flink | - | - | - | - | Removed (exited NL) |
| Butlon | - | - | - | - | Disabled (site down) |
| Joybuy | Screenshot (FF) | - | - | - | Blocked by corp IT, test from CI |

\* Hoogvliet estimate after scroll-to-load fix (pending test)

**Supermarket-specific quirks**:
- **Dirk**: Multi-product modal expansion (72 cards), dual tabs (t/m dinsdag + vanaf woensdag), weekend deals (VR, ZA & ZO ACTIE)
- **Hoogvliet**: AJAX lazy loading via `PromotionLoadScroll()` — needs gradual scroll (400px steps, 800ms delay) to trigger all category loads. Without this, only ~21 products load; with it, ~177 products across 20 categories
- **Aldi**: Uses `domcontentloaded` (continuous background requests cause `networkidle` timeout), Thursday-Wednesday deal cycles
- **Jumbo**: Uses `domcontentloaded` (same issue as Aldi), has "Laad meer" button for lazy loading
- **Kruidvat**: Switched from ScreenshotOCR (Firefox) to Publitas pipeline (`folder.kruidvat.nl`, 55 pages). Uses `at1600` resolution images (662KB) — `at2400` (1.2MB) causes Gemini timeout
- **Vomar**: Publitas embed URL in iframe, needs browser to resolve, then follows redirect to actual publication
- **DekaMarkt**: White-labeled Publitas (`folder.dekamarkt.nl`), follows redirect to weekly URL
- **Megafoodstunter**: Wholesale/bulk food outlet. Homepage has no products — deals page is `/acties` (editorial magazine-style layout)
- **Action**: All ~154 products rendered on page load (no lazy loading/pagination). Only 25 extracted — OCR accuracy issue with dense product grids, not a page interaction problem
- **Flink**: Exited Netherlands (redirects to Germany). DataDome CAPTCHA. Should be disabled
- **Butlon**: Domain `butlon.nl` unreachable — permanently down or renamed. Should be disabled
- **Joybuy**: Parent company Jingdong blocked by corporate IT. Needs two-step navigation (homepage for session cookies, then Flash Deals page). Test from GitHub Actions CI

**Publitas image resolution**: Prefer `at1600` (662KB) over `at2400` (1.2MB) — sufficient OCR quality without Gemini timeout risk. Configured in `PublitasOCRScraper.parseSpreadsData()`

**Gemini call timeout**: Individual `callGemini()` calls have a 120s timeout (`Promise.race`) to prevent hung API calls from blocking the dispatcher indefinitely. Dense flyer pages with `thinkingLevel: 'high'` are the main cause of timeouts.

### Open Items / Known Issues

**Completed**:
- [x] Supabase integration tested — DekaMarkt: 64 products inserted, `deal_type` + `requires_card` columns applied
- [x] Flink disabled in `index.ts` + removed from GitHub Actions matrix (exited NL)
- [x] Butlon disabled in `index.ts` + removed from GitHub Actions matrix (site down)
- [x] Hoogvliet timeout fixed — viewport 600px, 0 timeouts, 27 products
- [x] Kruidvat switched to Publitas — 181 products
- [x] Product URL extraction from DOM implemented for all screenshot scrapers

**OCR accuracy gaps**:
- **Action**: ~25/~154 products extracted. Dense product grid — viewport changes (480px, 768px, 1280px) didn't help. Known limitation with `thinkingLevel: 'high'` on dense grids
- **Megafoodstunter**: 7/12 products from editorial-style `/acties` page. Prompt hints added but editorial layout is inherently harder for OCR

**Product URL (`product_url`) status**:
- **Screenshot scrapers** (Dirk, Hoogvliet, Aldi, Action, Jumbo, Megafoodstunter): DOM-based URL extraction implemented via `extractProductUrls()` + `enrichWithUrls()` fuzzy matching. URLs populated during `scrapeProducts()`. Not yet verified with a real DB write
- **Publitas scrapers** (Vomar, DekaMarkt, Kruidvat): `product_url` is always `null` — flyer page images don't have clickable product links. Could potentially extract hotspot data from Publitas spreads metadata in the future
- **API scrapers** (AH, Picnic): URLs come from the API directly

**API scraper status**:
- **AH**: Working — mobile API returns ~1000+ bonus products per run
- **Picnic**: Broken — `403 Forbidden` after 2FA flag on new IP. Needs re-approval from home network or CI

**Remaining items**:
- [ ] Run all working scrapers for real (non-dry-run) to populate DB with current week's deals
- [ ] Verify product URL enrichment works in real DB writes (test with Dirk or Jumbo)
- [ ] Deactivate Flink + Butlon in Supabase DB (`is_active = false`)
- [ ] Picnic: re-approve 2FA from home network
- [ ] Joybuy: implement `beforeScreenshots()` with two-step navigation, test from CI
- [ ] Hoogvliet: scrape second week tab (upcoming week, ~176 more products)
- [ ] Combine Dirk's 72 individual modal screenshots into composite images to reduce chunk count
- [ ] Investigate `thinkingLevel: 'medium'` for dense-grid scrapers (Action, Hoogvliet)

## Supabase Notes

- **Auth**: Not enabled in MVP — mobile app uses anon key (read-only)
- **Storage**: Bucket `product-images` (public read) — path: `{slug}/{year}/{month}/{hash}.webp`
- **RLS**: Products/supermarkets/categories have public read; favorites requires auth
- Scraper uses `SUPABASE_SERVICE_KEY`; mobile app uses `SUPABASE_ANON_KEY`
- **Migrations**: `deal_type` (20260315000002) and `requires_card` (20260322000001) must be applied manually via Supabase SQL Editor — CLI not installed, service key can't run DDL
