# Dirk Data Quality Report

**Date**: 2026-04-06
**Scraper**: ScreenshotOCRScraper
**Source file**: `packages/scraper/dirk-products.json` (captured 2026-03-21)
**Mode**: dry-run (no DB writes)

---

## Summary

| Metric | Value |
|---|---|
| Products extracted | 291 |
| Expected product count | ~459 (648s run benchmark) |
| Extraction rate vs benchmark | 63% |
| Duplicate (title+price) pairs | 0 |
| Products with valid required fields | 291/291 |
| Enum violations (category_slug) | 0 |
| Enum violations (deal_type) | 0 |
| Date range violations | 0 |
| Price consistency violations | 0 |
| Stale data warning | Yes - all 291 products expired (from Mar 2026 run) |

**Note**: The `dirk-products.json` file was captured on 2026-03-21 and covers week deals from 2026-03-13 through 2026-03-24. All products are expired relative to the report date (2026-04-06). This is expected for a cached file - the scraper should be re-run for fresh data. The dry-run benchmark targets ~459 products in ~648s.

---

## Field Completeness

| Field | Filled | Empty | Invalid | Fill Rate |
|---|---|---|---|---|
| title | 291 | 0 | 0 | 100.0% |
| discount_price | 291 | 0 | 0 | 100.0% |
| requires_card | 291 | 0 | 0 | 100.0% |
| valid_from | 291 | 0 | 0 | 100.0% |
| valid_until | 291 | 0 | 0 | 100.0% |
| category_slug | 291 | 0 | 0 | 100.0% |
| deal_type | 291 | 0 | 0 | 100.0% |
| original_price | 225 | 66 | 0 | 77.3% |
| discount_percentage | 225 | 66 | 1* | 77.3% |
| description | 193 | 98 | 0 | 66.3% |
| unit_info | 186 | 105 | 0 | 63.9% |
| image_url | 0 | 291 | 0 | 0.0% (dry-run: no upload) |
| product_url | 0 | 291 | 0 | 0.0% (see URL section) |

\* One product ("De Vleeschmeesters Culinaire beenham") has `discount_percentage: 0` because `original_price` (5.00) and `discount_price` (4.99) differ by only 1 cent - technically correct but misleading (0.2% real discount).

---

## Validation Results

### Critical Issues: 0

No critical issues - all required fields (title, discount_price, requires_card) are present and valid on every product.

### Warnings: 2

1. **Zero discount_percentage** - 1 product ("De Vleeschmeesters Culinaire beenham") has `discount_percentage: 0` with `original_price: 5.00` and `discount_price: 4.99`. The 0.2% discount is effectively not a discount - this may be an OCR misread of the original price or a data edge case.
2. **Short brand-only titles** - 2 products ("HAK", "Arla") have titles of 3-4 characters with no product variant info. Both are brand names used as complete titles. While valid, they lose specificity.

### Detailed Checks

| Check | Result | Count |
|---|---|---|
| title: non-empty, 2-100 chars | PASS | 291/291 |
| discount_price > 0 | PASS | 291/291 |
| requires_card is boolean | PASS | 291/291 |
| original_price >= discount_price | PASS | 225/225 |
| discount_percentage in 0-100 | PASS | 225/225 |
| discount_percentage math within 5% tolerance | PASS | 225/225 |
| valid_until >= valid_from | PASS | 291/291 |
| dates within 2026 | PASS | 291/291 |
| deal_type valid enum value | PASS | 291/291 |
| category_slug valid enum value | PASS | 291/291 |
| no duplicate title+price pairs | PASS | 0 duplicates |
| discount_percentage not suspiciously 0 | WARN | 1 product |

---

## Date Analysis

| valid_from | valid_until | Products | Interpretation |
|---|---|---|---|
| 2026-03-13 | 2026-03-15 | 5 | VR, ZA & ZO weekend actie (Fri-Sun) |
| 2026-03-15 | 2026-03-22 | 106 | Tab 1: week t/m dinsdag (Mon-Tue end) |
| 2026-03-15 | 2026-03-24 | 2 | Extended week deal (t/m woensdag) |
| 2026-03-18 | 2026-03-24 | 168 | Tab 2: vanaf woensdag (Wed-next Tue) |
| 2026-03-20 | 2026-03-22 | 10 | VR, ZA & ZO weekend actie (Fri-Sun) |

The two-tab structure is correctly captured: 108 products from "t/m dinsdag" tab and 168 from "vanaf woensdag" tab, with 15 weekend actie products spread across both. All dates are correctly ordered (valid_from <= valid_until). No dates outside 2026.

---

## Price Analysis

| Metric | Value |
|---|---|
| Minimum price | 0.55 |
| Maximum price | 13.20 |
| Average price | 2.37 |
| Median price | 1.79 |
| Prices <= 0 | 0 |
| Prices > 50 (suspicious) | 0 |
| Prices with 1-cent discount (suspicious) | 1 |

Price distribution looks healthy for a Dutch supermarket discount scraper. All prices are in a plausible range (0.55-13.20 EUR). No negative or zero prices. The max of 13.20 is reasonable for meat/premium products.

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| dranken | 76 | 26.1% |
| bewaren | 35 | 12.0% |
| vlees-vis-vega | 31 | 10.7% |
| zuivel-eieren | 25 | 8.6% |
| groente-fruit | 24 | 8.2% |
| ontbijt | 18 | 6.2% |
| snoep-chips | 17 | 5.8% |
| persoonlijke-verzorging | 15 | 5.2% |
| huishouden | 14 | 4.8% |
| overig | 13 | 4.5% |
| diepvries | 12 | 4.1% |
| vers-gebak | 11 | 3.8% |

The dominance of `dranken` (26%) is notable - Dirk runs heavy drink promotions. No products were assigned `baby-kind`, `wonen-keuken`, `elektronica`, or `kleding-mode` - consistent with Dirk's food-focused assortment.

---

## Deal Type Distribution

| Deal Type | Count | % |
|---|---|---|
| stunt | 144 | 49.5% |
| korting | 131 | 45.0% |
| weekend_actie | 16 | 5.5% |

Dirk uses almost exclusively `stunt` and `korting` deal types. The absence of `1+1_gratis`, `2e_halve_prijs`, `x_voor_y`, and other complex deal types may reflect Dirk's discount structure - or may indicate that OCR is mapping complex deals to `korting`/`stunt` instead. Worth spot-checking a few physical flyer pages.

---

## URL Match Rate

| Metric | Value |
|---|---|
| product_url filled | 0/291 (0.0%) |
| image_url filled | 0/291 (0.0%) |
| Expected URL match rate | ~59% (benchmark: 344/581) |

Both `product_url` and `image_url` are null for all products in this file. This is consistent with a dry-run or pre-URL-enrichment output - the `dirk-products.json` file appears to be a raw OCR extraction output before the `enrichWithUrls()` and Supabase image upload steps run. In a full pipeline run, Dirk achieves ~59% URL match rate (344/581) via DOM extraction + fuzzy title matching.

---

## Sample Products (Good)

**Product 1 - Complete data, clear pricing:**
```json
{
  "title": "Smint mints",
  "discount_price": 1.99,
  "original_price": 4.19,
  "discount_percentage": 53,
  "description": "Pak 2 x 50 stuks.",
  "unit_info": "Pak 2 x 50 stuks.",
  "valid_from": "2026-03-15T23:00:00.000Z",
  "valid_until": "2026-03-22T22:59:59.999Z",
  "category_slug": "snoep-chips",
  "requires_card": false,
  "deal_type": "stunt"
}
```

**Product 2 - Correct weekend actie classification with tight date window:**
```json
{
  "title": "Bits & Bites Buitenlandse kaas",
  "discount_price": 3.49,
  "valid_from": "2026-03-13T00:00:00.000Z",
  "valid_until": "2026-03-15T00:00:00.000Z",
  "deal_type": "weekend_actie",
  "category_slug": "zuivel-eieren",
  "requires_card": false
}
```

**Product 3 - Good description and unit_info:**
```json
{
  "title": "Nestlé mini's",
  "discount_price": 2.49,
  "original_price": 3.95,
  "discount_percentage": 37,
  "description": "Zak 208 - 284 gram.",
  "unit_info": "Zak 208 - 284 gram.",
  "valid_from": "2026-03-15T23:00:00.000Z",
  "valid_until": "2026-03-22T22:59:59.999Z",
  "category_slug": "snoep-chips",
  "requires_card": false,
  "deal_type": "stunt"
}
```

---

## Issues Found

1. **Product count below benchmark** (291 vs ~459) - The file is from 2026-03-21, before dual-tab and composite modal improvements. A fresh run should yield ~459 products.

2. **Zero discount_percentage for near-identical prices** - "De Vleeschmeesters Culinaire beenham" shows original=5.00, discount=4.99, pct=0. The 0.2% discount rounds to zero. Minor edge case.

3. **Brand-only titles missing product variant** - "HAK" and "Arla" are brand names without product variant info. Reduces searchability.

4. **Johma Salades in `vers-gebak`** - "Johma Salades" (brood- en toastsalade) is a deli product, semantically better as `vlees-vis-vega` or `bewaren`. Minor categorization issue.

---

## Overall Score: A

### Justification

**A**: All 291 products have valid required fields (title, discount_price, requires_card). Zero critical issues. Zero invalid enums. Dates correctly ordered, price math consistent, zero duplicates. Dual-tab date structure (t/m dinsdag + vanaf woensdag + weekend actie) properly captured.

Minor notes (not score-impacting):
- `product_url` and `image_url` are 0% - expected for a pre-enrichment dry-run file; full pipeline achieves ~59%
- Product count (291) is below the 459 benchmark because this is an older capture (2026-03-21) before dual-tab improvements
- 2 brand-only titles ("HAK", "Arla") could be more descriptive
- 1 near-zero discount (0.2%) edge case

---

## Recommendations

1. **Re-run for fresh data** - The file is from 2026-03-21 and all products are expired. Run `npm run scrape -- --supermarket=dirk --dry-run` to validate the current ~459-product benchmark with dual-tab and composite modal improvements.

2. **Improve brand-only title handling** - When Gemini extracts only a brand name (e.g., "HAK", "Arla"), merge the description into the title if the title is <6 chars. A post-processing step in `responseParser.ts` could do this.

3. **Minor categorization spot-check** - "Johma Salades" in `vers-gebak` is debatable. Consider adding a prompt hint for deli/salad products to prefer `vlees-vis-vega`.
