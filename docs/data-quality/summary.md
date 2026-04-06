# Data Quality Summary

**Date**: 2026-04-06
**Scrapers validated**: 9 (all active scrapers)
**Total products validated**: ~2,249 products across all pipelines

---

## Overall Scorecard

| Supermarket | Score | Products | Pipeline | Key Issue |
|---|---|---|---|---|
| Albert Heijn | **A** | 1,244 | API | 5 dynamic deal_type values outside enum |
| Kruidvat | **A** | 186 | Publitas OCR | - |
| DekaMarkt | **A** | 59 | Publitas OCR | - |
| Vomar | **A** | 152 | Publitas OCR | 1 discount % mismatch, 5 stale dates |
| Dirk | **A** | 291* | Screenshot OCR | *Older file (Mar 2026), fresh run needed |
| Aldi | **B** | 28 | Screenshot OCR | 3 unreadable titles ("Onbekend"), Easter seasonal dip |
| Hoogvliet | **B** | 86 | Screenshot OCR | Week 2 dates bug (fixed), 50% URL match |
| Action | **B** | 132 | Screenshot OCR | 28 null deal_types, 12 null categories |
| Jumbo | **B** | 178 | Screenshot OCR | 10 null categories, 16 null deal_types |
| Megafoodstunter | **B** | 11 | Screenshot OCR | Title "80x70g", 23pp discount mismatch |

**Score system**: A = 90-100%, B = 75-89%, C = 50-74%, D = 25-49%, F = broken

---

## Pipeline Summary

| Pipeline | Scrapers | Avg Score | Notes |
|---|---|---|---|
| API | AH | A | Perfect structured data from official API |
| Publitas OCR | Kruidvat, DekaMarkt, Vomar | A | Consistent high quality, 0 failures |
| Screenshot OCR | Dirk, Aldi, Hoogvliet, Action, Jumbo, Megafoodstunter | B | Known gaps: null deal_types, null categories |

---

## Bugs Found and Fixed

### Fixed During Validation

| Fix | File | Impact |
|---|---|---|
| **Week 2 dates override** for Hoogvliet | `HoogvlietScraper.ts` | 45 products now get correct 08-14 Apr dates instead of current-week dates |
| **discount_percentage auto-correction** when >5pp off from calculated | `responseParser.ts` | Prevents OCR badge misreads (e.g., 48% stated vs 25% actual) |
| **Category page URL rejection** in enrichWithUrls | `ScreenshotOCRScraper.ts` | Prevents `/product-categorie/` URLs from being assigned as product_url |

### Bugs Still Open

| Issue | Supermarket | Severity | Recommendation |
|---|---|---|---|
| `3+1_gratis`, `5+1_gratis` outside deal_type enum | AH | Low | Map unrecognized multi-buy patterns to `x_voor_y` or extend enum |
| 28 null `deal_type` on Action weekactie items | Action | Low | Default to `stunt` in post-processing for Action |
| 12 null `category_slug` items | Action | Low | Fallback to `overig` in responseParser |
| 16 null `deal_type` items | Jumbo | Low | Default to `korting` fallback |
| 10 null `category_slug` items | Jumbo | Low | Add prompt hints for Appelsientje, Dove, Robijn brands |
| 3 "Onbekend" titles | Aldi | Medium | Filter or flag products with generic fallback titles |
| Title "80x70g" (unit dimension as title) | Megafoodstunter | Medium | Reject titles matching `/^\d+x\d+g?$/` in responseParser |
| Stale valid_from dates (Dec 2025 / Jan 2026) | Jumbo | Low | Date fallback should use today instead of historical default |

---

## Cross-Cutting Findings

### Category Slug Reference List

The validation plan initially contained the wrong category slug list. The correct 17 values from `packages/shared/src/types/Category.ts` are:

```
vers-gebak, vlees-vis-vega, zuivel-eieren, groente-fruit, diepvries, dranken,
bewaren, ontbijt, snoep-chips, persoonlijke-verzorging, huishouden, baby-kind,
elektronica, wonen-keuken, sport-vrije-tijd, kleding-mode, overig
```

**Not valid** (but commonly confused): `bakkerij`, `baby`, `huisdier`, `kleding`

### Null deal_type Pattern

Action (21% null) and Jumbo (9% null) both have significant null `deal_type` rates. In both cases Gemini couldn't identify the deal mechanic from the screenshot. Recommended fix per scraper:
- **Action**: default to `stunt` (all items are Action weekactie stunt prices)
- **Jumbo**: default to `korting` (Jumbo's most common deal type)

### URL Match Rates

| Scraper | URL Match Rate | Method |
|---|---|---|
| Action | 91% | DOM fuzzy matching |
| Dirk | ~59% (full run) | DOM + modal link extraction |
| Jumbo | 49% | DOM fuzzy matching |
| Hoogvliet | 50% | DOM fuzzy matching |
| AH | 100% | Direct from API |
| Publitas scrapers | 0% | Flyer images have no clickable links |

### Product Count vs Baseline

| Scraper | Validated | Baseline | Rate | Notes |
|---|---|---|---|---|
| AH | 1,244 | ~1,000+ | 124% | API pagination limit hit at 3,000 scans |
| Kruidvat | 186 | 181 | 103% | Normal variation |
| Vomar | 152 | 219 | 69% | Fewer deals this week |
| DekaMarkt | 59 | 69 | 86% | Normal variation |
| Dirk | 291 | 459 | 63% | Old file (pre dual-tab) |
| Jumbo | 178 | 130 | 137% | Custom product-group pipeline |
| Hoogvliet | 86 | 76 | 113% | Both weeks extracted |
| Action | 132 | 129-161 | 82-100% | Known OCR limit on dense grids |
| Aldi | 28 | 48 | 58% | Easter seasonal page |
| Megafoodstunter | 11 | 7 | 157% | Fuller editorial page this week |

---

## Recommendations (Priority Order)

### High Priority
1. **Dirk: re-run fresh** - Current report based on 2026-03-21 file (291 products). Run `npm run scrape -- --supermarket=dirk --dry-run` for a current 459-product validation.
2. **Action/Jumbo: null deal_type fallbacks** - 28 + 16 products without deal_type. Add per-scraper defaults in `responseParser.ts` or `getPromptHints()`.
3. **Title quality filter** - Reject titles matching `/^\d+x\d+g?$/` or shorter than 4 chars in `responseParser.ts` (catches "80x70g", "HAK", etc.).

### Medium Priority
4. **AH dynamic deal types** - `3+1_gratis`, `5+1_gratis` etc. are valid semantically but outside the enum. Either extend the enum or map to `x_voor_y` in AHScraper.
5. **Aldi "Onbekend" titles** - Filter products where title is "Onbekend" or "Onbekend product" (3 per run). These have prices/categories but no usable product name.
6. **Jumbo stale dates** - 4 products get Dec 2025/Jan 2026 fallback dates. Make the date fallback use today's date instead of a historical default.

### Low Priority
7. **Action/Jumbo null category fallback** - Add `overig` as default for null category_slug in responseParser (already done for invalid slugs, just not for null).
8. **Megafoodstunter title hints** - Add `getPromptHints()` instruction: always include product type prefix, never use quantity specs as title.
9. **Jumbo URL match rate** - 49% match rate. Consider using group page URL as fallback when no individual product URL matches.

---

## Files Written

```
docs/data-quality/
  validation-plan.md          (updated: correct category slug list)
  summary.md                  (this file)
  output/
    kruidvat.json             (10.2MB, 186 products)
    dekamarkt.json            (27KB, 59 products)
    aldi.json                 (28 products)
    action.json               (132 products)
    hoogvliet.json            (86 products)
    ah-products.json          (1,244 products)
  reports/
    kruidvat.md               Score A
    dekamarkt.md              Score A
    vomar.md                  Score A
    dirk.md                   Score A (old file)
    aldi.md                   Score B
    hoogvliet.md              Score B (bug fixed)
    action.md                 Score B
    jumbo.md                  Score B
    megafoodstunter.md        Score B
    ah.md                     Score A
```
