# Jumbo Data Quality Report

**Date**: 2026-04-06
**Scraper**: ScreenshotOCRScraper (JumboScraper - custom product-group pipeline)
**Mode**: dry-run
**Run duration**: ~21 minutes (08:34 - 08:55 UTC)
**Pipeline**: 91 product-group detail pages visited in parallel batches of 4, each screenshotted and OCR'd

---

## Summary

| Metric | Value |
|--------|-------|
| Total products scraped | 178 |
| Critical issues | 0 |
| Warnings | 26 |
| URL match rate | 88/178 (49%) |
| Image coverage | 148/178 (83%) |
| Avg discount price | EUR 7.16 |

---

## Field Completeness

| Field | Present | Rate |
|-------|---------|------|
| title | 178/178 | 100% |
| discount_price | 178/178 | 100% |
| requires_card | 178/178 | 100% |
| valid_from | 178/178 | 100% |
| valid_until | 178/178 | 100% |
| unit_info | 170/178 | 96% |
| description | 165/178 | 93% |
| image_url | 148/178 | 83% |
| product_url | 88/178 | 49% |
| discount_percentage | 32/178 | 18% |
| original_price | 31/178 | 17% |

Notes:
- Low `original_price` / `discount_percentage` coverage is expected: Jumbo rarely shows the old price on their deal detail pages - the deal type (1+1 gratis, x voor y, etc.) communicates the discount instead.
- `requires_card`: 1/178 products flagged as requiring a Jumbo "Extra's" loyalty card. The rest are universally available.

---

## Validation Results

### Critical Issues: 0

No critical issues found. All products have:
- Non-empty title
- discount_price > 0
- requires_card is boolean

### Warnings: 31

#### Enum: Null category_slug - 10 products

10 products have `category_slug: null` (Gemini could not determine category). The 5 `vers-gebak` products are correctly categorized - `vers-gebak` is a valid slug for fresh bakery items.

Null category products:
| Product title | Expected category |
|--------------|-----------------|
| Appelsientje Sinaasappel | dranken |
| Appelsientje FruitDrink Mango | dranken |
| Jumbo's Plantaardige Spinazie Cashew Girasoli | bewaren |
| Jumbo's Tagliatelle | bewaren |
| Dove Advanced Care | persoonlijke-verzorging |
| Rexona Women | persoonlijke-verzorging |
| Blends - Conditioner - Argan & Cameliaoli | persoonlijke-verzorging |
| Line Invisi Fix 24h Clear & Clean Gel | persoonlijke-verzorging |
| Robijn Intense Wasparfum Paradise Secret | huishouden |
| Robijn Intense Wasparfum Passiebloem & Muskus | huishouden |

#### Enum: Null deal_type - 16 products

16 products (9.0%) have `deal_type: null`. These products have valid prices and titles, but Gemini could not identify the deal type from the screenshot context. Most overlap with the null category products, suggesting these come from batches where OCR context was insufficient.

Notable products with null deal_type:
- Van de Boom Peer (EUR 2.49), Van de Boom Peer Siroop (EUR 3.29)
- Appelsientje Sinaasappel (EUR 3.19), Appelsientje FruitDrink Mango (EUR 1.99)
- Taft Maxx Power Gel, Taft Texture Styling Paste
- Nivea Sun Kids Sensitive SPF50+, Nivea Sun Kids Protect & Play 50+
- Robijn Intense Wasparfum (2 products)

#### No other warnings

- Price inversion (original_price < discount_price): 0
- Discount percentage out of range (0-100): 0
- Discount percentage calculation mismatch (>5%): 0
- Date range inversion (valid_until < valid_from): 0

### Detailed Checks

| Check | Result |
|-------|--------|
| title non-empty | PASS (178/178) |
| discount_price > 0 | PASS (178/178) |
| requires_card is boolean | PASS (178/178) |
| valid_from present | PASS (178/178) |
| valid_until present | PASS (178/178) |
| valid_until >= valid_from | PASS (178/178) |
| original_price >= discount_price | PASS (31/31 with both present) |
| discount_pct 0-100 | PASS (32/32 with value) |
| discount_pct calc accuracy (within 5%) | PASS (31/31 with both prices) |
| category_slug valid enum | PASS - all non-null values are valid |
| category_slug always set | WARN - 10 null (5.6%) |
| deal_type valid enum | WARN - 16 null (9.0%) |

---

## Date Analysis

| valid_from | valid_until | Products | Notes |
|------------|-------------|----------|-------|
| 2025-12-31 | 2026-04-28 | 3 | Very stale start date - fallback applied |
| 2026-01-01 | 2026-04-28 | 1 | Stale start date - fallback applied |
| 2026-03-07 | 2026-04-06 | 1 | Expires today |
| 2026-03-18 | 2026-04-07 | 2 | Ongoing deals, correct for Easter week |
| 2026-03-23 | 2026-04-07 | 3 | Easter deals, ongoing |
| 2026-03-25 | 2026-04-07 | 40 | Current week deals (Tue-Sun pattern) |
| 2026-03-25 | 2026-04-12 | 1 | |
| 2026-03-25 | 2026-04-21 | 9 | Longer promotional periods |
| 2026-04-01 | 2026-04-07 | 57 | Current week deals (32%) |
| 2026-04-01 | 2026-04-12 | 1 | |
| 2026-04-05 | 2026-04-12 | 60 | Next week deals, starting Sunday (34%) |

**Key observations**:
- The dominant date ranges (2026-04-01 to 2026-04-07 = 57 products; 2026-04-05 to 2026-04-12 = 60 products) are correct - this captures both current and upcoming week deals at Jumbo.
- 4 products have very stale valid_from dates (Dec 2025 / Jan 2026) - these appear to be longer-running promotions or the response parser's fallback date kicking in. The valid_until dates (Apr 28) are plausible for extended promos.
- 1 product expired today (Jumbo Paaseitjes Melk Karamel Smaak Gevuld, valid until 2026-04-06) - Easter-specific product.
- No already-expired products.

---

## Price Analysis

| Metric | Value |
|--------|-------|
| Minimum price | EUR 0.22 |
| Maximum price | EUR 41.16 |
| Average price | EUR 7.16 |

- Price range is plausible for a Dutch supermarket deal aggregator.
- Original price coverage is low (17%) because Jumbo's deal format focuses on deal mechanics (1+1, x voor y) rather than showing before/after prices.
- For `korting` deals, 25/55 (45%) have original_price - reasonable.
- For `x_voor_y` deals, 6/29 (21%) have original_price.
- For all bundle deal types (1+1_gratis, 2e_halve_prijs, 2+1_gratis, combinatie_korting): 0% have original_price - expected, Jumbo only shows the deal price for these.

---

## Category Distribution

| Category | Products | % |
|----------|----------|---|
| dranken | 36 | 20.2% |
| persoonlijke-verzorging | 26 | 14.6% |
| ontbijt | 24 | 13.5% |
| zuivel-eieren | 16 | 9.0% |
| groente-fruit | 16 | 9.0% |
| vlees-vis-vega | 12 | 6.7% |
| huishouden | 11 | 6.2% |
| overig | 10 | 5.6% |
| null | 10 | 5.6% |
| bewaren | 6 | 3.4% |
| vers-gebak | 5 | 2.8% |
| diepvries | 4 | 2.2% |
| snoep-chips | 2 | 1.1% |

10 products have null categories (5.6%). `vers-gebak` is a valid slug - the 5 fresh bakery products are correctly categorized.

---

## Deal Type Distribution

| Deal Type | Products | % |
|-----------|----------|---|
| korting | 55 | 30.9% |
| 1+1_gratis | 41 | 23.0% |
| x_voor_y | 29 | 16.3% |
| null (invalid) | 16 | 9.0% |
| 2+1_gratis | 13 | 7.3% |
| 2e_halve_prijs | 10 | 5.6% |
| combinatie_korting | 5 | 2.8% |
| stunt | 5 | 2.8% |
| overig | 3 | 1.7% |
| extra | 1 | 0.6% |

Distribution is realistic for a Dutch supermarket. `korting` (plain discount) dominating at 31% is expected. The bundle deals (1+1, x_voor_y, 2+1, 2e halve prijs) together account for ~52% which is typical for Jumbo's deal format. `extra` at 1 product (requires_card=true) correctly identifies the Jumbo loyalty deal.

---

## URL Match Rate

**88/178 products have a product_url (49%)**

This is lower than ideal. Contributing factors:
- Jumbo's product-group pipeline: the scraper visits group detail pages (e.g., `/aanbiedingen/johma-salades/3015236`) and extracts URLs from those pages. Some groups may link to category pages rather than individual product pages.
- Products with generic group names (e.g., "Gourmet Pasen") won't fuzzy-match to individual product URLs.
- URL enrichment relies on fuzzy title matching with a threshold of 0.35 - group-level product names may not match the individual product link text.

---

## Overall Score: B

### Justification

**Strengths (pushes toward A):**
- Zero critical issues - all 178 products have title, discount_price > 0, and boolean requires_card
- 100% date coverage with valid date ranges
- Correct price logic - no inverted prices, no out-of-range percentages
- Realistic deal type distribution accurately reflects Jumbo's promotional mechanics
- 83% image coverage
- 96% unit_info coverage

**Weaknesses (keeps at B):**
- 10/178 (5.6%) null category_slug values
- 16/178 (9.0%) null deal_type values
- 49% URL match rate (88/178) - below the 59% achieved by Dirk
- Low original_price coverage (17%) - acceptable given Jumbo's deal format, but limits price comparison utility
- 4 products with very stale valid_from dates (Dec 2025 / Jan 2026) - fallback dates from responseParser

Score breakdown: 178 valid products, 0 critical failures, 26 warnings (10 null category + 16 null deal_type). ~15% of products have at least one null optional field. Core pricing and date integrity is perfect (100%). Overall quality is solid.

**[B = 75-89% quality threshold met: core fields perfect, 2 enum fields with ~9-10% miss rate each]**

---

## Recommendations

1. **Address null deal_type products** - 16 products with valid prices but no deal_type suggests these come from deal group pages where the deal mechanics weren't clearly visible in the screenshot. Consider adding a default fallback in `responseParser.ts`: if `deal_type` is null but `discount_price` is set, default to `korting`.

2. **Address null category products** - Drinks (Appelsientje, Van de Boom) and personal care items (Dove, Rexona, Robijn) have null categories. Add explicit prompt examples for these brand categories in `getPromptHints()`.

3. **Improve URL match rate** - The 49% URL match rate could be improved by:
   - Lowering the fuzzy match threshold further (currently 0.35) for Jumbo-specific group-level products
   - Extracting the group URL itself as `product_url` fallback when no individual product URL matches

4. **Stale valid_from fallback dates** - 4 products have Dec 2025 / Jan 2026 valid_from dates. These are likely cases where Gemini couldn't extract dates and the `responseParser.ts` date fallback assigned a far-past date. Consider making the fallback use today's date instead of a historical default.

5. **Performance note** - The scraper took ~21 minutes to process 91 product groups. With only 10 API keys available locally (vs. 60+ in CI), 429 WAF hits were frequent, forcing concurrency down to 5. In CI with 60 keys, this should complete in ~5-7 minutes. Consider reducing `PARALLEL_TABS` from 4 to 2 locally to reduce burst 429s.
