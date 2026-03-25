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
- **Composite modal images**: The 70+ individual modal screenshots are combined into ~13 composite images (6 modals stacked vertically per image using `sharp`). This reduces API calls from 74 → 13, making Dirk **2.3x faster** (913s vs 2077s) with **9% more products** (580 vs 530). Composites give Gemini more context per image → better extraction. Only Dirk uses this technique — other scrapers don't have expandable modals.
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

### Key Pool & Dispatcher Architecture (AIMD v6)

The dispatcher (`GeminiExtractor.ts`) + key pool (`keyPool.ts`) use an **AIMD (Additive Increase, Multiplicative Decrease)** concurrency control algorithm — the same approach TCP uses for network congestion control. The system self-discovers the optimal concurrency instead of hardcoding a guess.

**Setup**: 70 keys × 1 model (`flash-lite` only) = 70 slots. Flash model removed — only 20 RPD, generated 429-noise.

**Async while-loop dispatcher** (replaces earlier `setInterval` polling):
```
currentConcurrency = 10  (start conservative)
CEILING = 30, FLOOR = 5

while (queue has chunks OR slots in-flight):
  if (in-flight >= currentConcurrency):   ← AIMD gate
    await delay(50ms)
    continue
  if (free slot AND chunk in queue):
    dispatch chunk → slot IN-FLIGHT
    await delay(150ms)                    ← global pacing (~6.6 req/s)
  else:
    await delay(50ms)
```

**AIMD behavior**:
- **Additive Increase**: On success → `currentConcurrency += 0.2` (slowly raise, +1 per 5 successes)
- **Multiplicative Decrease**: On WAF 429 → `currentConcurrency *= 0.5` (emergency brake, halve immediately)
- **RPD detection**: On 429 where key has 5+ consecutive fails → disable key, do NOT punish concurrency
- Ceiling: 30 (absolute max), Floor: 5 (never go below)

**Slot lifecycle**:
```
FREE → dispatch → IN-FLIGHT → success → RATE_LIMITED (4.1s cooldown) → FREE
                            → WAF 429 → RATE_LIMITED (15s→30s→60s backoff) → FREE
                            → RPD 429 (5+ consecutive fails) → DISABLED (permanent)
                            → API_KEY_INVALID → DISABLED (permanent)
                            → timeout (120s) → permanent failure
```

**Three protection layers**:
1. **AIMD concurrency gate**: Dynamically limits simultaneous HTTP connections (10→30). Finds the WAF limit automatically.
2. **Global pacing** (150ms): Max ~6.6 dispatches/sec. Spreads requests over time.
3. **Success cooldown** (4.1s): Same key can't be reused within 4.1s (15 RPM = 1 per 4s per project).

**RPD vs WAF 429 detection**: Google's error messages don't distinguish RPD from WAF 429s. Instead, we track **consecutive fails per key** — if the same key fails 5 times in a row without a single success, it's assumed RPD-exhausted and disabled. This prevents the AIMD from punishing concurrency for dead keys.

**Performance evolution** (Dirk scraper, ~45 chunks):
| Version | Method | Duration | 429 errors | Key change |
|---|---|---|---|---|
| v1 | setInterval, all at once | 2077s | 500+ | Baseline |
| v3 | async while + 150ms pacing | 688s | 390 | Async loop + pacing |
| v4 | + fixed gate MAX=15 | 722s | 446 | Concurrency gate |
| v5 | + AIMD (10→30) | 767s | 256 | Self-tuning concurrency |
| **v6** | **+ RPD detect + floor=5** | **648s** | **56** | **RPD auto-disable** |

**3.2x faster, 89% fewer errors** from v1 to v6.

### Full OCR Pipeline Flow (end-to-end)

```
1. BROWSER PHASE (Playwright)
   │  Navigate to URL → handle cookies → beforeScreenshots() hook
   │  (expand modals, click tabs, scroll to load, wait for lazy content)
   │  Time: 10-80s depending on page complexity
   │
2. CAPTURE PHASE
   │  Screenshot scrapers: scroll in viewport-sized steps with 20% overlap
   │  Dirk: modal screenshots combined into composite images (6 per image via sharp)
   │  Publitas scrapers: download flyer page images from CDN (at1600 resolution)
   │  Output: array of ImageChunk[] (PNG buffers)
   │  Time: 5-15s
   │
3. URL EXTRACTION (screenshot scrapers only)
   │  extractProductUrls(page): query all <a> tags from DOM
   │  Store for post-OCR fuzzy matching
   │  Time: <1s
   │
4. DISPATCH PHASE (AIMD v6 — GeminiExtractor async while-loop)
   │  Concurrency gate: max `currentConcurrency` in-flight (starts 10, adapts 5-30)
   │  Global pacing: 150ms between dispatches (~6.6 req/s max)
   │  Success: slot → 4.1s cooldown, concurrency += 0.2
   │  WAF 429: slot → backoff (15s→30s→60s), concurrency *= 0.5
   │  RPD 429 (5+ consecutive fails): key disabled, concurrency NOT punished
   │  Timeout (120s): permanent failure
   │
5. GEMINI API CALL (per chunk)
   │  Model: gemini-3.1-flash-lite-preview (Lite only, Flash removed)
   │  Config: thinking=high, temperature=0.0, mediaResolution=HIGH, structured output
   │  Input: image buffer (base64) + extraction prompt + context (supermarket, categories)
   │  Output: JSON array of ScrapedProduct[] via responseSchema enforcement
   │  Time per call: 3-60s (depends on image complexity + thinking level)
   │
6. POST-PROCESSING
   │  parseGeminiResponse(): validate fields, coerce prices, fallback dates
   │  Cross-chunk dedup: normalize title + price → remove duplicates from overlap zones
   │  enrichWithUrls(): fuzzy-match OCR titles to DOM links → populate product_url
   │  Time: <1s
   │
7. DB INSERT (BaseScraper)
   │  For each product: compute scrape_hash (SHA-256) → INSERT with ON CONFLICT skip
   │  Download product images → WebP optimize → upload to Supabase Storage
   │  Log to scrape_logs table (success/partial/failed)
   │  Time: 5-30s depending on product count
```

### Speed Optimization Analysis

**Completed optimizations**:
- [x] AIMD v6 dispatcher: 3.2x faster, 89% fewer 429s (2077s→648s for Dirk)
- [x] Composite modal images for Dirk (74 → 13 chunks)
- [x] Async while-loop (replaces setInterval polling)
- [x] Global pacing (150ms between dispatches)
- [x] Success cooldown (4.1s per key)
- [x] RPD auto-disable (5 consecutive fails → key disabled, AIMD not punished)
- [x] Lite-only model (Flash removed — 20 RPD caused noise)

**Remaining optimizations**:
- [x] `thinkingLevel: 'medium'` for Action — 34 products, 0 timeouts (implemented)
- [ ] Increase timeout to 180s for Publitas (dense flyer pages need more time)
- [ ] Browser pooling across scrapers (save ~5-8s startup per scraper)

**Rate limit lessons learned**:
- Google WAF blocks >15-18 **simultaneous** HTTP connections from one IP (regardless of API keys)
- RPM (15/min) is per-project, but WAF burst limit is per-IP — these are independent limits
- RPD (500/day for Lite, 20/day for Flash) resets at midnight Pacific
- Google's 429 error messages do NOT distinguish RPD from WAF — use consecutive fail tracking instead
- **Do NOT spam 429'd keys** — Google escalates rate limits across ALL projects on the same Gmail account
- AIMD (TCP congestion control) is the correct approach — the system finds the WAF limit itself

**Tested results** (70 keys × 1 model = 70 slots, AIMD v6):
| Supermarket | Pipeline | Products | Chunks | Duration |
|---|---|---|---|---|
| Dirk | Screenshot | 459 | 45 (composites) | 648s |
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

**Latest results** (2026-03-25, after all optimizations):
| Supermarket | Pipeline | Products | Duration | Status |
|---|---|---|---|---|
| Dirk | Screenshot + composites | 459 | 648s | Working, 59% URL match |
| Vomar | Publitas | 219 | 80s | Working |
| Kruidvat | Publitas | 181 | 846s | Working |
| DekaMarkt | Publitas | 69 | 23s | Working, DB tested |
| Hoogvliet | Screenshot (dual-week) | 76 | ~250s | Working (27+49) |
| Aldi | Screenshot | 48 | 464s | Working |
| Action | Screenshot (7 pages) | 129 | ~7min | Working (80% of 161) |
| Jumbo | Screenshot | 21 | 70s | Working |
| Megafoodstunter | Screenshot | 7 | 144s | Working |
| AH | API | ~1000+ | - | Unchanged |
| Picnic | API | - | - | Broken (403, needs 2FA) |
| Flink | - | - | - | Disabled (exited NL) |
| Butlon | - | - | - | Disabled (site down) |
| Joybuy | Screenshot (FF) | - | - | Blocked by corp IT |

**Total: 9 OCR scrapers working — ~1,209 products** + AH API (~1000+)

**Supermarket-specific quirks**:
- **Dirk**: Multi-product modal expansion (72 cards), dual tabs (t/m dinsdag + vanaf woensdag), weekend deals (VR, ZA & ZO ACTIE)
- **Hoogvliet**: AJAX lazy loading via `PromotionLoadScroll()` — needs gradual scroll (400px steps, 800ms delay) to trigger all category loads. Without this, only ~21 products load; with it, ~177 products across 20 categories
- **Aldi**: Uses `domcontentloaded` (continuous background requests cause `networkidle` timeout), Thursday-Wednesday deal cycles
- **Jumbo**: Uses `domcontentloaded` (same issue as Aldi), has "Laad meer" button for lazy loading
- **Kruidvat**: Switched from ScreenshotOCR (Firefox) to Publitas pipeline (`folder.kruidvat.nl`, 55 pages). Uses `at1600` resolution images (662KB) — `at2400` (1.2MB) causes Gemini timeout
- **Vomar**: Publitas embed URL in iframe, needs browser to resolve, then follows redirect to actual publication
- **DekaMarkt**: White-labeled Publitas (`folder.dekamarkt.nl`), follows redirect to weekly URL
- **Megafoodstunter**: Wholesale/bulk food outlet. Homepage has no products — deals page is `/acties` (editorial magazine-style layout)
- **Action**: 7 pages with ~23 products each (161 total). Pagination implemented — shared extractor across all pages, cross-page dedup. 129/161 = 80% extracted. Remaining 20% is inherent OCR miss on dense grids (composite card screenshots also tested, did not improve). `thinkingLevel: 'medium'` for speed
- **Flink**: Exited Netherlands (redirects to Germany). DataDome CAPTCHA. Should be disabled
- **Butlon**: Domain `butlon.nl` unreachable — permanently down or renamed. Should be disabled
- **Joybuy**: Parent company Jingdong blocked by corporate IT. Needs two-step navigation (homepage for session cookies, then Flash Deals page). Test from GitHub Actions CI

**Publitas image resolution**: Prefer `at1600` (662KB) over `at2400` (1.2MB) — sufficient OCR quality without Gemini timeout risk. Configured in `PublitasOCRScraper.parseSpreadsData()`

**Gemini call timeout**: Individual `callGemini()` calls have a 120s timeout (`Promise.race`) to prevent hung API calls from blocking the dispatcher indefinitely. Dense flyer pages with `thinkingLevel: 'high'` are the main cause of timeouts.

### Open Items / Known Issues

**Completed**:
- [x] Supabase integration tested — DekaMarkt: 64 products inserted, `deal_type` + `requires_card` columns applied
- [x] Dirk real DB write — 530 products inserted with product URLs (102 matched)
- [x] Flink disabled in `index.ts` + removed from GitHub Actions matrix (exited NL)
- [x] Butlon disabled in `index.ts` + removed from GitHub Actions matrix (site down)
- [x] Hoogvliet timeout fixed — viewport 600px, 0 timeouts, 27 products
- [x] Kruidvat switched to Publitas — 181 products
- [x] Product URL extraction from DOM implemented for all screenshot scrapers
- [x] Composite modal images for Dirk — 74 → 13 chunks, 2.3x faster (913s vs 2077s), 9% more products
- [x] Staggered dispatch — max 10 slots per 100ms tick to prevent burst 429s
- [x] Hoogvliet dual-week scraping — 27 → 76 products (current + upcoming week)
- [x] Action pagination — 7 pages, shared extractor, cross-page dedup — 34 → 129 products
- [x] `thinkingLevel: 'medium'` per scraper — Action uses medium (0 timeouts), rest uses high

**OCR accuracy gaps**:
- **Action**: 129/161 products (80%) after pagination fix (7 pages). Composite card screenshots tested but did not improve — dense grid is an inherent OCR limitation
- **Megafoodstunter**: 7/12 products from editorial-style `/acties` page. Prompt hints added but editorial layout is inherently harder for OCR

**Product URL (`product_url`) extraction & matching**:

The OCR pipeline extracts product data from screenshots but can't extract clickable URLs from images. Product URLs are obtained separately from the DOM and matched to OCR products via fuzzy title matching.

**Pipeline** (`ScreenshotOCRScraper`):
1. `extractProductUrls(page)` — after `beforeScreenshots()`, query all `<a href>` elements from the DOM
   - Filters out non-product links (login, social, legal, navigation)
   - For links with no visible text: extracts product name from URL path (e.g., `/boodschappen/.../1%20de%20beste%20ijsbergsla%20melange/43355` → "1 de beste ijsbergsla melange")
   - Dirk override: also captures `<a>` links from each open modal overlay during expansion (362 extra links)
2. `enrichWithUrls(products, domLinks)` — after OCR extraction + dedup, matches products to links via fuzzy scoring:
   - **Exact match** (normalized) → score 1.0
   - **Substring containment** (one fully contains the other) → score 0.7-0.9 scaled by length ratio
   - **Word overlap** (weighted Jaccard + title coverage) → proportional score
   - **URL path matching** — also matches OCR title against decoded URL path segments
   - Threshold: score ≥ 0.35 to apply match (lowered from 0.5 for better coverage)
   - Normalization: lowercase, strip diacritics, remove non-alphanumeric, collapse whitespace

**Results (Dirk)**:
- Tab 1: 99/114 = **87%** matched
- Tab 2: 245/260 = **94%** matched
- Total: 344/581 = **59%** (was 102/530 = 19% before improvements)
- Remaining 41% unmatched: products without individual product pages (bulk items, modal-only variants)

**Per pipeline type**:
- **Screenshot scrapers** (Dirk, Hoogvliet, Aldi, Action, Jumbo, Megafoodstunter): DOM-based extraction + fuzzy matching. Dirk has additional modal link extraction.
- **Publitas scrapers** (Vomar, DekaMarkt, Kruidvat): `product_url` is always `null` — flyer pages are images without clickable product links
- **API scrapers** (AH, Picnic): URLs come directly from the API response

**API scraper status**:
- **AH**: Working — mobile API returns ~1000+ bonus products per run
- **Picnic**: Broken — `403 Forbidden` after 2FA flag on new IP. Needs re-approval from home network or CI

**Remaining items**:
- [ ] Run all working scrapers for real (non-dry-run) to populate DB with current week's deals
- [ ] Deactivate Flink + Butlon in Supabase DB (`is_active = false`)
- [ ] Picnic: re-approve 2FA from home network
- [ ] Joybuy: implement `beforeScreenshots()` with two-step navigation, test from CI
- [x] Hoogvliet: dual-week scraping implemented — 27 → 76 products (2.8x)
- [x] `thinkingLevel: 'medium'` for Action — implemented, 0 timeouts
- [x] Action pagination — 34 → 129 products across 7 pages (3.8x improvement)
- [ ] Action: investigate remaining 20% OCR miss on dense grids (129/161 = 80%)
- [ ] Improve Dirk URL match rate beyond 59% (344/581)
- [ ] Test Joybuy from GitHub Actions CI (blocked by corporate IT locally)

## Supabase Notes

- **Auth**: Not enabled in MVP — mobile app uses anon key (read-only)
- **Storage**: Bucket `product-images` (public read) — path: `{slug}/{year}/{month}/{hash}.webp`
- **RLS**: Products/supermarkets/categories have public read; favorites requires auth
- Scraper uses `SUPABASE_SERVICE_KEY`; mobile app uses `SUPABASE_ANON_KEY`
- **Migrations**: `deal_type` (20260315000002) and `requires_card` (20260322000001) must be applied manually via Supabase SQL Editor — CLI not installed, service key can't run DDL
