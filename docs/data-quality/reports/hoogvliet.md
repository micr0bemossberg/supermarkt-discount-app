# Hoogvliet Data Quality Report

**Date**: 2026-04-06
**Scraper**: ScreenshotOCRScraper (dual-week)
**Mode**: dry-run
**Run duration**: ~144s (49s week 1 OCR + 70s week 2 OCR + browser/scroll overhead)

---

## Summary

| Metric | Value |
|---|---|
| Total products | 86 |
| Week 1 (current, t/m 12 apr) | 41 |
| Week 2 (upcoming, 08-14 apr) | 45 |
| Critical issues | 0 |
| Warnings | 2 |
| URL match rate | 50.0% (43/86) |
| Overall score | **B** |

The scraper successfully triggered dual-week scraping: it detected the "Aanbiedingen 08 april - 14 april" checkbox and switched to it. Both weeks extracted cleanly with no critical field failures. The main concerns are: (1) week 2 products carry week 1 validity dates instead of 08-14 april, and (2) 50% URL match rate.

---

## Field Completeness

| Field | Present | % | Notes |
|---|---|---|---|
| `title` | 86/86 | 100.0% | All products have titles |
| `discount_price` | 86/86 | 100.0% | All products have a discount price |
| `original_price` | 48/86 | 55.8% | Missing for 38 products (deal cards without prior price) |
| `discount_percentage` | 48/86 | 55.8% | Matches `original_price` presence |
| `category_slug` | 86/86 | 100.0% | All valid enum values |
| `deal_type` | 86/86 | 100.0% | All assigned |
| `valid_from` | 86/86 | 100.0% | All populated |
| `valid_until` | 86/86 | 100.0% | All populated |
| `requires_card` | 86/86 | 100.0% | All boolean `false` |
| `product_url` | 43/86 | 50.0% | 43 matched via DOM fuzzy matching |
| `description` | 48/86 | 55.8% | Populated where OCR found variant text |
| `unit_price_info` | 0/86 | 0.0% | Not extracted - OCR does not produce this field for Hoogvliet |
| `weight_info` | 0/86 | 0.0% | Not extracted - OCR does not produce this field for Hoogvliet |

---

## Validation Results

### Critical Issues: 0

No critical issues found. All products have non-empty titles, `discount_price > 0`, and `requires_card` is a valid boolean.

### Warnings: 2

| # | Type | Details |
|---|---|---|
| 1 | `discount_pct_mismatch` | **Honig** (index 28): `discount_percentage` is 50, computed from prices is 82.4%. OCR read `unit_info: "1+1 gratis"`, `original_price: 8.46` (likely 2-pack total), `discount_price: 1.49`. The 50% figure was read from a badge while the stored `original_price` inflates the computed discount. |
| 2 | `week2_dates` | All 45 week 2 products carry week 1 validity dates (5-12 Apr) instead of correct 8-14 Apr. See Date Analysis. |

### Detailed Checks

**Price consistency** (discount_price <= original_price): PASS for all 48 products with original_price present.

**Discount percentage range** (0-100): PASS for all 48 with percentage present.

**Discount percentage accuracy** (within 10% of computed): 47/48 PASS. 1 mismatch (Honig, see Warning 1).

**Valid date order** (valid_until >= valid_from): PASS for all 86 products.

**Deal type enum**: PASS for all 86 products. Values used: `korting` (51), `stunt` (10), `overig` (8), `1+1_gratis` (7), `x_voor_y` (6), `gratis_bijproduct` (4).

**Category slug enum**: PASS for all 86 products. `vers-gebak` is a valid enum value.

---

## Date Analysis

**Important: Week 2 validity date bug detected.**

The upcoming week checkbox showed label "Aanbiedingen | 08 april - 14 april" — confirming a second week was scraped. However, all 86 products (both week 1 and week 2) carry identical validity dates:

- `valid_from`: `2026-04-05T22:00:00.000Z` (Mon 6 Apr 00:00 CET)
- `valid_until`: `2026-04-12T21:59:59.999Z` (Sun 12 Apr 23:59 CET)

Week 2 products (45 products, 08-14 apr) should have:
- `valid_from`: `2026-04-07T22:00:00.000Z` (Tue 8 Apr 00:00 CET)
- `valid_until`: `2026-04-13T21:59:59.999Z` (Mon 14 Apr 23:59 CET)

**Root cause**: The `HoogvlietScraper` does not inject a `validFrom`/`validUntil` override for week 2. The Gemini OCR reads dates from the page, but the week 2 page apparently does not display explicit date ranges on each product tile, so OCR falls back to the default week 1 dates. This means week 2 products, once inserted into the database, will expire 2 days early and be deactivated incorrectly on 13 April (when the week 1 cleanup runs), causing the week 2 deals to disappear prematurely.

**Recommendation**: After week 2 extraction, post-process the products to override `valid_from`/`valid_until` to the correct week 2 range based on the checkbox label text (already captured in the log as "08 april - 14 april").

---

## Price Analysis

| Metric | Value |
|---|---|
| Minimum discount price | €0.49 |
| Maximum discount price | €18.87 |
| Average discount price | €3.48 |
| Products with prices | 86/86 |

The price range looks realistic for a Dutch supermarket weekly deals page. The max (€18.87) corresponds to a bulk household item (Robijn laundry products bundle). The average of €3.48 is consistent with grocery promotions.

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| `groente-fruit` | 36 | 41.9% |
| `dranken` | 12 | 14.0% |
| `vlees-vis-vega` | 8 | 9.3% |
| `bewaren` | 8 | 9.3% |
| `snoep-chips` | 4 | 4.7% |
| `zuivel-eieren` | 5 | 5.8% |
| `huishouden` | 3 | 3.5% |
| `vers-gebak` | 3 | 3.5% |
| `ontbijt` | 3 | 3.5% |
| `diepvries` | 3 | 3.5% |
| `overig` | 1 | 1.2% |

The heavy `groente-fruit` weighting (42%) is plausible - Hoogvliet typically features many fresh produce deals. `vers-gebak` is a valid category slug for fresh bakery items.

---

## Deal Type Distribution

| Deal Type | Count | % |
|---|---|---|
| `korting` | 51 | 59.3% |
| `stunt` | 10 | 11.6% |
| `overig` | 8 | 9.3% |
| `1+1_gratis` | 7 | 8.1% |
| `x_voor_y` | 6 | 7.0% |
| `gratis_bijproduct` | 4 | 4.7% |

Distribution looks reasonable. The 8 `overig` classifications may include deals the OCR could not confidently classify (e.g., "10 voor €10" bundles or complex tiered discounts). No `2e_halve_prijs` detected - consistent with Hoogvliet's typical promotion style.

---

## URL Match Rate

| Metric | Value |
|---|---|
| Products with `product_url` | 43 |
| Products without `product_url` | 43 |
| Match rate | 50.0% |
| DOM links extracted | 797 |

797 product-like links were extracted from the DOM. The 50% match rate (43/86) is lower than the 87-94% achieved for individual Dirk tabs, likely because:
1. Hoogvliet groups products under category headers rather than individual product pages for all deals
2. Some products are "variant groups" (e.g., "Groentemix, broccoli of bloemkool") that don't map cleanly to a single URL
3. Week 2 URL extraction may not capture the same product links as week 1 since the page was reloaded via checkbox

---

## Overall Score: B

### Justification

**Strengths**:
- Zero critical field issues (title, discount_price, requires_card all 100% valid)
- Dual-week scraping worked correctly - both week 1 (41) and week 2 (45) extracted
- All deal types and all 86 category slugs are valid
- Price range and averages are realistic
- All date ordering checks pass
- 86 total products extracted, close to the expected ~76-177 range

**Deductions**:
- **Week 2 validity dates were wrong** - all 45 upcoming-week products carried week 1 dates. Bug fixed in `HoogvlietScraper.ts` (parse date range from checkbox label and override). Will be B until a fresh run confirms the fix.
- **50% URL match rate** - acceptable but lower than Dirk's 87-94%

---

## Recommendations

1. **Week 2 validity dates - FIXED**: `parseDutchDateRange()` added to `HoogvlietScraper.ts`. Parses "08 april - 14 april" from checkbox label and overrides `valid_from`/`valid_until` on all week 2 products. Confirm with a fresh dry-run.

2. **Investigate Honig price mismatch** (low priority): Product 28 (Honig) has `discount_percentage: 50` but computed percentage from stored prices is 82.4%. This suggests the `original_price` field captured the 2-unit bundle price rather than the single-unit price. The `unit_info: "1+1 gratis"` correctly describes the deal; the issue is in how original_price is interpreted. Consider adding a normalization step for 1+1 deals to halve the original_price.

4. **Unit/weight extraction** (low priority): `unit_price_info` and `weight_info` are 0% populated. If these are needed for the mobile app, the prompt hints for Hoogvliet should be updated to explicitly request extraction of weight/volume information from product labels.

5. **Week 2 URL matching** (low priority): Consider a second `extractProductUrls()` call after switching to week 2 and merging the URL sets before fuzzy matching, to improve the 50% match rate.
