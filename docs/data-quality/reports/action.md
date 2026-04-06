# Action Data Quality Report

**Date**: 2026-04-06
**Scraper**: ScreenshotOCRScraper (7-page pagination)
**Mode**: dry-run
**Source URL**: https://www.action.com/nl-nl/weekactie/

---

## Summary

| Metric | Value |
|--------|-------|
| Products extracted | 132 |
| Expected (historical) | ~161 (7 pages x ~23) |
| Extraction rate | ~82% of historical baseline |
| Screenshot chunks | 84 / 84 (100% processed, ~12 per page) |
| Duration | 134 seconds (~2.2 min) |
| API keys active | 10 keys / 10 slots |
| 429 rate-limit errors | 0 |
| Timeouts | 0 |
| Cross-page duplicates removed | 34 (overlap dedup working correctly) |
| Error log lines | 0 |

**Note on product count**: 132 vs the historical ~161 is consistent with the documented 80% extraction rate for Action. Action uses dense product grids that are an inherent OCR challenge - some product cards partially cut by viewport edges or overlapping text are missed. All 7 pages were scraped, all 84 chunks were processed without errors, and 0 timeouts occurred. The count reflects actual OCR capability on Action's grid layout, not a scraper failure.

---

## Field Completeness

| Field | Filled | Total | Rate | Notes |
|-------|--------|-------|------|-------|
| title | 132 | 132 | 100% | All non-empty, readable product names |
| discount_price | 132 | 132 | 100% | All valid numbers > 0 |
| requires_card | 132 | 132 | 100% | All false (correct - Action has no loyalty card) |
| valid_from | 132 | 132 | 100% | All set |
| valid_until | 132 | 132 | 100% | All set |
| description | 132 | 132 | 100% | Unusually high - Action cards typically include brief descriptions |
| unit_info | 132 | 132 | 100% | All set |
| product_url | 120 | 132 | 91% | 12 unmatched (9.1%) - very strong URL match rate |
| category_slug | 120 | 132 | 91% | 12 null (see warnings) |
| deal_type | 104 | 132 | 79% | 28 null (21.2%) - mainly products where Gemini could not assign a type |
| original_price | 0 | 132 | 0% | Expected - Action uses "stunt" pricing without reference prices |
| discount_percentage | 0 | 132 | 0% | Expected - no original_price means no percentage calculable |
| image_url | 0 | 132 | 0% | Expected in dry-run - image downloads skipped (no DB writes) |

---

## Validation Results

### Critical Issues: 0

No critical failures. All 132 products have the three required fields (title, discount_price, requires_card) with valid values.

### Warnings: 2

### Detailed Checks

| Check | Result | Details |
|-------|--------|---------|
| title non-empty | PASS | 132/132 non-empty |
| discount_price > 0 | PASS | 132/132 valid (range: 0.59 - 599.00) |
| requires_card is boolean | PASS | 132/132 (all false) |
| original_price >= discount_price | PASS | Not applicable - 0 products have original_price |
| discount_percentage 0-100 | PASS | Not applicable |
| discount_percentage matches calculation (within 5%) | PASS | Not applicable |
| valid_until >= valid_from | PASS | All 132 date pairs are valid |
| category_slug is valid enum | PASS | All 120 non-null values are valid (sport-vrije-tijd, kleding-mode are valid slugs) |
| deal_type is valid enum | PASS | All 104 non-null deal_type values are valid |
| No duplicate title+price | PASS | 0 duplicates in final output |
| deal_type always set | WARN | 28 products (21.2%) have null deal_type |
| category_slug always set | WARN | 12 products (9.1%) have null category_slug |

**Warning details**:

1. **28 null deal_type products** - Gemini could not assign a deal type. All Action "weekactie" items should default to `stunt`. The 96 correctly labeled `stunt` products show the model knows the right type; the 28 nulls are likely borderline cards where no deal badge was visible.

2. **12 null category_slug products** - Items like Keter bloempot, Leifheit raamwisser, Varta batterijen, Tuinstoel, Dettol allesreiniger, and Easter seasonal items (Paashaas knuffel, Trolli Easter Eggies) lack a category. All mappable to existing categories with better prompt hints or a fallback to `overig`.

---

## Date Analysis

| Attribute | Value |
|-----------|-------|
| Products with valid_from | 132 / 132 (100%) |
| Products with valid_until | 132 / 132 (100%) |
| Unique valid_from values | 2 |
| Unique valid_until values | 2 |

**Date ranges observed**:

| valid_from | valid_until | Products | Notes |
|------------|-------------|----------|-------|
| 2026-04-05T22:00:00.000Z | 2026-04-12T21:59:59.999Z | 126 | Standard week deal (Mon-Sun) |
| 2026-04-01T00:00:00.000Z | 2026-04-07T00:00:00.000Z | 6 | Weekend actie (shorter window) |

All dates are valid and consistent. The two-date-range split correctly identifies the main weekactie vs. shorter weekend promotions. No `valid_until < valid_from` violations.

---

## Price Analysis

| Metric | Value |
|--------|-------|
| Min price | 0.59 |
| Max price | 599.00 |
| Average price | 11.40 |
| Products with original_price | 0 / 132 |
| Products with discount_percentage | 0 / 132 |

**Price distribution**:

| Range | Count | % |
|-------|-------|---|
| Under €1 | 20 | 15.2% |
| €1 - €5 | 78 | 59.1% |
| €5 - €10 | 19 | 14.4% |
| €10 - €20 | 8 | 6.1% |
| €20 - €50 | 2 | 1.5% |
| Over €50 | 5 | 3.8% |

**Notable high-value items** (over €50): HP laptop EliteBook 845 G8 (€599), Bartafel met solarverlichting (€99), Draaistoel voor buiten x2 (€89.95 each), Verstelbare tuinstoelen (€59.90). These are plausible Action non-food products and are not data errors.

**No original_price / discount_percentage fields**: Action uses a "stunt price" model where only the final price is shown on the weekactie page - there is no reference price. This is expected behavior and not a data quality issue.

---

## Category Distribution

| Category | Count | % |
|----------|-------|---|
| wonen-keuken | 38 | 28.8% |
| huishouden | 18 | 13.6% |
| overig | 15 | 11.4% |
| snoep-chips | 13 | 9.8% |
| null | 12 | 9.1% |
| persoonlijke-verzorging | 12 | 9.1% |
| elektronica | 9 | 6.8% |
| sport-vrije-tijd | 7 | 5.3% |
| kleding-mode | 7 | 5.3% |
| dranken | 1 | 0.8% |

The category distribution is realistic for Action's product mix (non-food general merchandise, home goods, snacks, personal care). The high `wonen-keuken` share reflects Action's spring/outdoor furniture focus this week.

---

## Deal Type Distribution

| Deal Type | Count | % |
|-----------|-------|---|
| stunt | 96 | 72.7% |
| null | 28 | 21.2% |
| weekend_actie | 6 | 4.5% |
| korting | 2 | 1.5% |

The dominant `stunt` type correctly reflects Action's pricing model. The 6 `weekend_actie` products are correctly identified (shorter validity window: April 1-7). The 28 nulls are a known gap - see warnings.

---

## URL Match Rate

| Page | Extracted | URLs Matched | Rate |
|------|-----------|-------------|------|
| Page 1 | 35 | 35/35 | 100% |
| Page 2 | 32 | 31/32 | 97% |
| Page 3 | 31 | 28/31 | 90% |
| Page 4 | 18 | 15/18 | 83% |
| Page 5 | 19 | 17/19 | 89% |
| Page 6 | 19 | 18/19 | 95% |
| Page 7 | 12 | 10/12 | 83% |
| **Total (pre-dedup)** | **166** | **154/166** | **93%** |
| **Final (post-dedup)** | **132** | **120/132** | **91%** |

URL match rate is 91%, which is excellent. This is a major improvement over the Dirk 59% rate and well above the 0% rate for Publitas-based scrapers.

---

## Pipeline Performance

| Page | Chunks | Products extracted | Dupes removed | Tokens | Duration |
|------|--------|--------------------|---------------|--------|----------|
| 1 | 14 | 35 | 2 | 42,291 | 9s |
| 2 | 12 | 32 | 2 | 37,056 | 9s |
| 3 | 12 | 31 | 6 | 37,168 | 10s |
| 4 | 12 | 18 | 3 | 34,943 | 9s |
| 5 | 12 | 19 | 3 | 35,201 | 9s |
| 6 | 12 | 19 | 5 | 36,030 | 8s |
| 7 | 10 | 12 | 1 | 28,671 | 6s |
| **Total** | **84** | **166** | **22** | **251,360** | **~60s OCR** |

Total pipeline (including browser phases): 134 seconds. 0 timeouts, 0 errors.

---

## Overall Score: B

### Justification

Action scores **B (75-89%)** based on the following:

**Strengths**:
- 0 critical issues - all products have valid title, discount_price, and requires_card
- 82% extraction rate (132/161), consistent with the documented 80% baseline
- 100% date coverage with correct two-range split (weekactie vs. weekend_actie)
- 91% URL match rate - excellent for a screenshot-based scraper
- 0 duplicates in final output - cross-page dedup is working correctly
- 0 timeouts, 0 errors, 0 rate-limit hits across 84 chunks
- 134s total runtime - fast for a 7-page scraper (vs. 161s historical)
- Price range (0.59 - 599) is realistic and internally consistent

**Weaknesses preventing an A**:
- 28 products (21.2%) have null `deal_type` - should default to `stunt` for Action
- 12 products (9.1%) have null `category_slug` - needs prompt improvement or fallback to `overig`
- 82% extraction rate (132/161) - known OCR limitation on Action's dense grids, documented

---

## Recommendations

1. **deal_type default fallback** - In `responseParser.ts`, if a product's `deal_type` is null and the supermarket is Action (or any `stunt`-model store), default to `stunt`. This would fix the 28 null deal_type products.

3. **category_slug fallback to `overig`** - In `responseParser.ts`, if `category_slug` is null, default to `overig` rather than leaving it null. This would fix the 12 null category products and any DB NOT NULL constraint.

4. **Prompt hints for seasonal items** - Add hint in Action's `getPromptHints()` for seasonal/Easter items (Paashaas knuffel, Trolli Easter Eggies) to be mapped to `snoep-chips` or `overig` rather than leaving category null.

5. **Extraction rate improvement** - The 18% miss rate (29/161) is documented as an inherent OCR limitation on Action's dense grids. Composite card screenshots were tested and did not improve results. No further action needed unless a new layout is introduced.
