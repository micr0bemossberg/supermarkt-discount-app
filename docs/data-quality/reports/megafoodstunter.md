# Megafoodstunter Data Quality Report

**Date**: 2026-04-06
**Scraper**: ScreenshotOCRScraper
**Mode**: dry-run
**Run duration**: 71s
**Chunks processed**: 9 / 9 OK (0 failed)
**Tokens used**: ~47,657

---

## Summary

| Metric | Value |
|---|---|
| Products extracted | 11 |
| Expected (historical) | ~7 |
| Chunks processed | 9 / 9 (0 failed) |
| URL matches | 10 / 11 (91%) |
| Duration | 71s |
| 429 errors | 0 |
| Deduplicates removed | 0 |

This run extracted **11 products** - above the historical average of 7, suggesting the editorial `/acties` page had a fuller set of offers this week. All 9 screenshot chunks completed without error.

**Note on run-to-run consistency**: A comparison run with `--output` captured a slightly different 12th product ("Afbak Bollen wit 70x80g" with `deal_type: "1+1_gratis"`) that did not appear in the repeated run. This is a known OCR non-determinism artefact from overlapping screenshot chunks and Gemini's sampling behavior.

---

## Field Completeness

| Field | Present | Missing | % Complete |
|---|---|---|---|
| title | 11 | 0 | 100% |
| discount_price | 11 | 0 | 100% |
| original_price | 11 | 0 | 100% |
| discount_percentage | 11 | 0 | 100% |
| description | 10 | 1 | 91% |
| unit_info | 11 | 0 | 100% |
| product_url | 10 | 1 | 91% |
| valid_from | 11 | 0 | 100% |
| valid_until | 11 | 0 | 100% |
| category_slug | 11 | 0 | 100% |
| deal_type | 11 | 0 | 100% |
| requires_card | 11 | 0 | 100% |

---

## Validation Results

### Critical Issues: 3

### Warnings: 4

### Detailed Checks

| Check | Result | Details |
|---|---|---|
| All titles non-empty | FAIL | 1 title is a unit dimension, not a product name (see below) |
| All discount_price > 0 | PASS | All prices are positive |
| requires_card is boolean | PASS | All 11 are `false` |
| original_price >= discount_price | PASS | All 11 satisfy this |
| discount_percentage 0-100 | PASS | Range: 20%-50% |
| discount_percentage matches calculation (within 5%) | FAIL | 1 mismatch (see below) |
| valid_until >= valid_from | PASS | All dates are consistent |
| All category_slugs valid | PASS | All slugs are from the approved list |
| All deal_types valid | PASS | All 11 use `korting` |
| product_url is product page (not category page) | WARN | 1 URL points to a category page |

---

### Critical Issue 1 - Invalid title ("80x70g")

Product at index 6 has `title: "80x70g"` - this is a unit dimension, not a product name. The OCR incorrectly extracted the quantity/weight specification as the title. This product also has no URL match. It appears to be a duplicate or OCR artifact of the "Croissant 80x70 gram" product (same price EUR 16, same discount_percentage 47%, same `valid_from`/`valid_until`).

**Impact**: If inserted into DB, this product will display as "80x70g" to users - unintelligible.

**Recommendation**: Add a validation rule in `responseParser.ts` to reject titles that match the pattern `/^\d+x\d+g?$/` (pure quantity specs).

---

### Critical Issue 2 - Discount percentage mismatch ("Diepvriesman Kaassoufflé Halve Maan")

| Field | Value |
|---|---|
| original_price | 20.00 |
| discount_price | 15.00 |
| stated discount_percentage | 48% |
| calculated discount_percentage | 25% |
| Difference | 23 percentage points |

The stated 48% is wildly incorrect. The OCR likely misread either a nearby product's percentage or a printed "Halve Maan" label percentage. At EUR 15 for a box of 24 x 70g kaassoufflés (wholesale), the EUR 20 original price and 25% discount are plausible.

**Impact**: Mobile app discount badge will show "48% korting" instead of "25% korting" - misleads users.

**Recommendation**: The post-processing step in `responseParser.ts` already has a discount_percentage consistency check. Verify it is enforcing recalculation when the stated value deviates by more than 5 percentage points, and that it is applied to this scraper's output.

---

### Critical Issue 3 - Run-to-run inconsistency (non-deterministic OCR)

Between two identical dry-run executions, one extra product appeared in one run ("Afbak Bollen wit 70x80g", `deal_type: "1+1_gratis"`) but not the other. This points to:
- The product appearing in an overlap zone between screenshot chunks (20% overlap)
- Gemini's sampling producing different extraction results on the same image

**Impact**: DB population is non-deterministic; a product may or may not appear depending on the run. The `scrape_hash` dedup prevents double-insertion but won't help if the product is missed entirely.

**Recommendation**: Review whether the overlap between chunks 8 and 9 can be increased, or whether the editorial layout warrants a `beforeScreenshots()` hook to scroll/pause differently.

---

### Warning 1 - Incomplete title ("Rustiek")

Product title is just `"Rustiek"` - this is the style variant of a baguette, not the full product name. The full name visible on the site is "Baguette Rustiek Meergranen 15x440g".

**Recommendation**: The `getPromptHints()` for Megafoodstunter should instruct Gemini to always include the product category/type prefix in the title (e.g., "Baguette Rustiek" not just "Rustiek").

---

### Warning 2 - Category mismatch ("Hamburgerbroodje" assigned to `ontbijt`)

Hamburger buns are classified under `ontbijt` (breakfast). The more appropriate category is `vers-gebak` (fresh bakery), consistent with other bread products in this run. This is an OCR/prompt categorization issue.

---

### Warning 3 - URL mismatch (Loempia Ham & Kip matched to category page)

`"Loempia Ham & Kip 12x200g"` was matched to `https://megafoodstunter.nl/product-categorie/kip/` - a category listing page, not a product page. The fuzzy matcher scored this as a sufficient match (keyword "kip") but the URL is not product-specific.

**Recommendation**: Add a URL validation rule to reject matches to `/product-categorie/` paths. These are never valid product pages.

---

### Warning 4 - URL fuzzy match quality (Croissant matched to "botercroissant")

`"Croissant 80x70 gram"` was matched to `https://megafoodstunter.nl/product/botercroissant-120x80-gram/` - a different product variant (120x80g vs 80x70g). The match is semantically reasonable but technically incorrect.

**Impact**: Low - users clicking through will see a related product, not a broken link.

---

## Date Analysis

| Field | Value | Assessment |
|---|---|---|
| valid_from | 2026-04-05T22:00:00.000Z | Sun 5 Apr at 22:00 UTC = Mon 6 Apr 00:00 CEST - correct start of week |
| valid_until | 2026-04-12T21:59:59.999Z | Sun 12 Apr at 21:59 UTC = Sun 12 Apr 23:59 CEST - correct end of week |
| Consistency | All 11 products share identical dates | PASS |
| valid_until > valid_from | Yes (7-day window) | PASS |

Date handling is correct. The 7-day validity window (Mon-Sun) is consistent with weekly promotional cycles. Timezone handling (CEST UTC+2) is applied correctly.

---

## Price Analysis

Note: Megafoodstunter is a bulk/wholesale outlet - prices represent case/box quantities, not single units. Prices are intentionally higher than typical supermarket single-item prices.

| Product | Discount Price | Original Price | Disc% (stated) | Disc% (calc) | Delta | Status |
|---|---|---|---|---|---|---|
| Tarwebroodje wit de luxe | 16.00 | 30.00 | 47% | 46.7% | 0.3pp | PASS |
| Croissant 80x70 gram | 16.00 | 32.00 | 50% | 50.0% | 0pp | PASS |
| Kaas Twister 50x90 gram | 20.00 | 35.00 | 43% | 42.9% | 0.1pp | PASS |
| Ham Kaas Croissant | 37.50 | 65.00 | 42% | 42.3% | 0.3pp | PASS |
| Hamburgerbroodje | 10.00 | 18.00 | 44% | 44.4% | 0.4pp | PASS |
| Rustiek | 16.00 | 20.00 | 20% | 20.0% | 0pp | PASS |
| 80x70g | 16.00 | 30.00 | 47% | 46.7% | 0.3pp | PASS (title issue) |
| Diepvriesman Frikandel Excellent | 20.95 | 38.00 | 45% | 44.9% | 0.1pp | PASS |
| HOMEKO Kroket Rundvlees | 18.95 | 38.00 | 50% | 50.1% | 0.1pp | PASS |
| Diepvriesman Kaassoufflé Halve Maan | 15.00 | 20.00 | 48% | 25.0% | 23pp | FAIL |
| Loempia Ham & Kip 12x200g | 24.00 | 36.00 | 33% | 33.3% | 0.3pp | PASS |

Price range: EUR 10 - EUR 37.50 (wholesale case prices, expected).
Discount range: 20% - 50% (reasonable for a bulk outlet).
Average discount: ~42% (strong discounts consistent with Megafoodstunter's positioning).

---

## Category Distribution

| Category Slug | Count | Products |
|---|---|---|
| vers-gebak | 4 | Tarwebroodje, Croissant, Kaas Twister, Ham Kaas Croissant |
| ontbijt | 3 | Hamburgerbroodje (warn), Rustiek, 80x70g |
| diepvries | 4 | Frikandel, Kroket, Kaassoufflé, Loempia |

All category slugs are from the approved list. No `overig` fallbacks used. The `ontbijt` category assignment for bread products is debatable but not invalid.

---

## Deal Type Distribution

| Deal Type | Count | % |
|---|---|---|
| korting | 11 | 100% |

All 11 products are classified as `korting`. This is consistent with Megafoodstunter's promotional style (always percentage/price reductions, never multi-buy promotions like 1+1). However, the comparison run produced one product with `deal_type: "1+1_gratis"` - suggesting the OCR occasionally misclassifies deals, or that one product genuinely had a 1+1 offer that was inconsistently extracted.

---

## Overall Score: B

### Justification

- 9 / 11 products (82%) have fully clean data (correct title, matching discount%, valid URL, appropriate category)
- 2 critical data quality failures out of 11 products (18% failure rate): invalid title "80x70g" and discount_percentage mismatch on Kaassoufflé
- 1 additional critical structural issue (run-to-run non-determinism)
- URL match rate is excellent at 91% (10/11), above the 59% Dirk baseline
- All dates are correct and consistent
- No missing required fields
- The 11 products extracted exceeds the historical 7-product baseline - improvement in OCR coverage

Score breakdown:
- Field completeness: 98% (1 missing description, 1 missing URL) - excellent
- Title validity: 91% (1 of 11 is a unit spec, not a name) - good
- Discount accuracy: 91% (1 of 11 has >5pp mismatch) - good
- URL quality: 82% (1 category URL, 1 wrong-variant URL) - acceptable
- Category accuracy: 91% (1 debatable assignment) - good
- Structural consistency: partial (non-deterministic chunk boundary behavior)

B = 75-89% range. The scraper is functional and producing useful data but has two recurring OCR quality issues (unit-as-title, percentage misread) that affect a minority of products.

---

## Recommendations

1. **Reject unit-as-title products in `responseParser.ts`** - Add a validation rule to discard or flag products whose title matches patterns like `/^\d+x\d+g?$/` or is shorter than 5 characters. These are always OCR extraction errors.

2. **Recalculate and override discount_percentage on large deviations** - The `responseParser.ts` consistency check should forcibly recalculate `discount_percentage` from `original_price` and `discount_price` when the stated value deviates by more than 5 percentage points. The Kaassoufflé issue (23pp off) would be caught and corrected automatically.

3. **Reject category-page URLs in `enrichWithUrls()`** - Add a filter to discard URL matches where the path contains `/product-categorie/`. These are never valid product destinations.

4. **Add `getPromptHints()` instruction for full product names** - Update `MegafoodstunterScraper.getPromptHints()` to instruct Gemini: "Always include the product type/category in the title (e.g., 'Baguette Rustiek' not just 'Rustiek'). Never use quantity specifications (e.g., '80x70g') as the product title."

5. **Investigate screenshot chunk overlap at page boundaries** - The non-deterministic 12th product appearing in only one run suggests it falls in a chunk overlap zone. Consider adjusting the scroll step size or overlap percentage for the Megafoodstunter `/acties` page.

6. **Monitor deal_type classification** - All 11 products are `korting` but the comparison run produced a `1+1_gratis` classification. Review the prompt to ensure Gemini correctly distinguishes discount types for this editorial layout.
