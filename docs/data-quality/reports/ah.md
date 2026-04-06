# Albert Heijn (AH) Data Quality Report

**Date**: 2026-04-06
**Scraper**: AHScraper (API pipeline)
**Mode**: dry-run
**Output file**: `docs/data-quality/output/ah-products.json`

---

## Summary

| Metric | Value |
|---|---|
| Total products | 1,244 |
| API source | `api.ah.nl/mobile-services/product/search/v2` |
| Auth method | Anonymous token (`/mobile-auth/v1/auth/token/anonymous`) |
| Pages scanned | 15 of 15 (3,000 products scanned, 400 hit graceful stop) |
| Total catalog size reported | 10,000 |
| Scrape duration | 10 seconds |
| Alcohol products excluded | Yes (filtered by `alcoholPercentage > 0`) |

The API returns a 400 error after page 15 (3,000 products scanned) despite reporting 10,000 total. This is a known AH API limitation - the scraper handles it gracefully and stops without error.

---

## Field Completeness

| Field | Present | % | Notes |
|---|---|---|---|
| `title` | 1,244 / 1,244 | 100% | All populated |
| `description` | 1,244 / 1,244 | 100% | Discount label or bonusMechanism text |
| `discount_price` | 1,244 / 1,244 | 100% | All positive, non-zero |
| `original_price` | 1,244 / 1,244 | 100% | Full coverage (unlike OCR scrapers) |
| `discount_percentage` | 903 / 1,244 | 73% | Missing for bundle deals - expected (see below) |
| `deal_type` | 1,244 / 1,244 | 100% | |
| `valid_from` | 1,244 / 1,244 | 100% | Calculated (week Monday) |
| `valid_until` | 1,244 / 1,244 | 100% | Calculated (week Sunday) |
| `category_slug` | 1,244 / 1,244 | 100% | All valid slugs |
| `product_url` | 1,244 / 1,244 | 100% | `ah.nl/producten/product/wi{id}` |
| `image_url` | 1,242 / 1,244 | 99.8% | 2 products missing image |
| `unit_info` | 1,244 / 1,244 | 100% | e.g. "2 stuks", "500g" |
| `is_online_only` | 1,244 / 1,244 | 100% | AH-specific field, fully populated |
| `requires_card` | 0 / 1,244 | 0% | **Expected** - API pipeline limitation, not in API response |

**Note**: `requires_card` is always null for AH. The AH API does not expose card-requirement data in the bonus product feed. All AH bonus deals implicitly require the Bonuskaart, but this cannot be set per-product from the API.

---

## Validation Results

### Critical Issues: 0

No critical issues found. All titles are non-empty, all prices are valid and positive.

### Warnings: 4 categories

#### Warning 1 - Invalid deal_type values (5 products)

The scraper dynamically generates deal type strings for unusual multi-buy deals that fall outside the defined enum:

| Deal Type Generated | Count | Example |
|---|---|---|
| `3+1_gratis` | 1 | AH Excellent Feest stolletje - "3+1 gratis" |
| `5+1_gratis` | 3 | AH Ginger passion, Biologisch Knijpfruit - "5+1 gratis" |
| `2+3_gratis` | 1 | Oral-B 3D White tandpasta - "2+3 gratis" |

These are real deals with valid data, but the generated strings are not in the `VALID_DEAL_TYPES` enum. The `classifyDealType()` method uses a dynamic pattern `${buy}+${free}_gratis` for any multi-buy combination not explicitly covered.

**Impact**: These products will fail any strict enum validation in the DB or app layer.
**Fix**: Either add these types to the enum, or map unusual multi-buy deals to `overig` or `x_voor_y`.

#### Warning 2 - Duplicate titles (29 products)

29 products share an identical normalized title with at least one other product. These are likely the same physical product appearing in different bundle configurations (e.g., a 2-pack and 4-pack with the same title text from the API).

Sample duplicates:
- "pink lady appels schaal 2-pack"
- "ah gerookte spekreepjes 2-pack"
- "calvé pindakaas pot"
- "ah blauwe bessen"
- "liga cracotte vezelrijk"

**Impact**: After `scrape_hash` dedup (which uses title + price), most of these will insert correctly since they differ in price. Title-only matching in UI or grocery list matcher may surface both.

#### Warning 3 - Missing discount_percentage for 341 bundle deals (expected behavior)

341 products have `original_price == discount_price` and no `discount_percentage`. These are all bundle/multi-buy deals where the discount is structural (buy 2 get 1 free) rather than a price reduction. The API does not return a percentage for these deal types:

| Deal Type | Count |
|---|---|
| `x_voor_y` | 114 |
| `1+1_gratis` | 120 |
| `2e_halve_prijs` | 57 |
| `2+1_gratis` | 33 |
| `3+1_gratis` | 1 |
| `5+1_gratis` | 3 |
| `2+3_gratis` | 1 |
| `bonus` | 12 |

For `x_voor_y` and `*+*_gratis` deals, `original_price == discount_price` is correct - the "discount" is the deal mechanic itself, not a price reduction. The 12 `bonus` deals with equal prices are a minor data quality gap (bonus deal with no calculable savings).

**Impact**: Mobile app should not show "0% off" for these - it should display the deal description instead.

#### Warning 4 - 2 products without image_url

- Melkunie Protein aardbei yoghurt 6-pack
- Mona Pudding vanille aardbeiensaus duo 4-pack

The AH API returned no image data for these products. **Impact**: Low, only 0.16% of products.

### Detailed Checks

| Check | Result |
|---|---|
| `title` non-empty | PASS - 0 empty |
| `discount_price` > 0 | PASS - 0 zero/invalid |
| `original_price >= discount_price` (korting deals) | PASS - 0 violations for `korting` type |
| `discount_percentage` 0-100 | PASS - 0 out of range |
| `discount_percentage` matches calculation (within 5%) | PASS - 0 mismatches |
| `valid_until >= valid_from` | PASS - 0 reversed |
| `valid_from` / `valid_until` parseable | PASS - 0 invalid dates |
| `category_slug` in valid enum | PASS - 0 invalid |
| `deal_type` in valid enum | WARN - 5 invalid (dynamic multi-buy strings) |
| No duplicate titles | WARN - 29 duplicates found |

---

## Date Analysis

All 1,244 products share the same validity window, calculated at scrape time based on the current week:

| Field | Value |
|---|---|
| `valid_from` | 2026-04-05T22:00:00.000Z (Mon 6 Apr 00:00 CET) |
| `valid_until` | 2026-04-11T22:00:00.000Z (Sun 12 Apr 00:00 CET) |

Dates are stored in UTC. The 22:00 UTC offset is correct for CET (UTC+2 in summer time) - midnight local = 22:00 UTC. The week range is Monday to Sunday, which matches AH's bonus week cycle.

**Note**: These dates are computed by `getWeekDates()` at scrape time, not extracted from the API. This means they are always accurate for the current week but do not reflect any mid-week deal changes or early/late deal windows that AH may use for specific products.

---

## Price Analysis

| Metric | Value |
|---|---|
| Average discount price | €6.73 |
| Minimum price | €0.69 |
| Maximum price | €149.00 |
| Products with original_price | 1,244 / 1,244 (100%) |
| Products where korting saves money (orig > disc) | 756 / 756 (100%) |
| Products with no price savings (bundle deals) | 341 (27%) |

High-value outliers (>€50) include multi-pack bundles and a garden furniture item (Keter Southwood 643L at €149, down from €219). These are valid "volume voordeel" online-bundle deals.

AH provides the most complete pricing data of all scrapers: every product has both `discount_price` and `original_price`, eliminating the need for any price fallback logic.

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| `zuivel-eieren` | 344 | 27.7% |
| `groente-fruit` | 145 | 11.7% |
| `vlees-vis-vega` | 142 | 11.4% |
| `dranken` | 129 | 10.4% |
| `bewaren` | 116 | 9.3% |
| `snoep-chips` | 93 | 7.5% |
| `overig` | 88 | 7.1% |
| `huishouden` | 77 | 6.2% |
| `ontbijt` | 45 | 3.6% |
| `vers-gebak` | 38 | 3.1% |
| `diepvries` | 19 | 1.5% |
| `persoonlijke-verzorging` | 4 | 0.3% |
| `baby-kind` | 4 | 0.3% |

**Observations**:
- `zuivel-eieren` dominates at 28% - expected for a Dutch supermarket (dairy-heavy).
- `elektronica`, `wonen-keuken`, `sport-vrije-tijd`, `kleding-mode` have 0 products - these non-food categories are not present in AH's bonus catalog.
- The 88 `overig` (7.1%) represents products where neither the API `mainCategory` nor keyword matching resolved a specific category. This is acceptable but could be improved with more keyword mappings.

---

## Deal Type Distribution

| Deal Type | Count | % | Valid Enum |
|---|---|---|---|
| `korting` | 756 | 60.8% | Yes |
| `bonus` | 159 | 12.8% | Yes |
| `1+1_gratis` | 120 | 9.6% | Yes |
| `x_voor_y` | 114 | 9.2% | Yes |
| `2e_halve_prijs` | 57 | 4.6% | Yes |
| `2+1_gratis` | 33 | 2.7% | Yes |
| `5+1_gratis` | 3 | 0.2% | **No** |
| `3+1_gratis` | 1 | 0.1% | **No** |
| `2+3_gratis` | 1 | 0.1% | **No** |

`korting` (60.8%) and `bonus` (12.8%) together represent 73.6% of products. The 5 products with invalid deal types are genuine AH promotions that fall outside the standard enum.

---

## Online-Only Distribution

| Value | Count | % |
|---|---|---|
| `true` (online-only) | 712 | 57.2% |
| `false` (in-store available) | 532 | 42.8% |

57% of AH bonus products are online-only ("volume voordeel" multi-packs). This is a notable AH characteristic - the API marks large bundle packs as online-only since they are web-exclusive. This field is well-populated and can be used in the mobile app to filter in-store vs online deals.

---

## Overall Score: A

### Justification

The AH API scraper produces high-quality, consistent data:

- **100% completeness** on all critical fields: title, price, dates, category, deal_type, product_url, is_online_only
- **Zero critical validation failures**: no empty titles, no zero prices, no reversed dates, no out-of-range percentages
- **Full price coverage**: every product has both discount and original price (100% vs ~60-80% for OCR scrapers)
- **Fast and stable**: 10 seconds, 15 API pages, graceful error handling on page 16 400-error
- **Minor warnings only**: 5 out-of-enum deal type strings (0.4%), 29 title duplicates, 2 missing images

Deductions from A+:
- 5 products with dynamically generated deal type strings outside the enum
- 29 title duplicates (expected from multi-pack variants, handled by scrape_hash dedup)
- `requires_card` always null (API limitation, not a scraper bug)
- 88 products (7%) in `overig` that could potentially be categorized better

---

## Recommendations

1. **Fix invalid deal types** - Add `3+1_gratis`, `5+1_gratis`, and other dynamic multi-buy patterns to the `VALID_DEAL_TYPES` enum in `packages/shared/src/types/`, OR map anything not explicitly in the enum to `x_voor_y` (semantically correct for multi-buy deals).

2. **Handle bundle deal display in mobile app** - For `x_voor_y` and `*+*_gratis` deals where `discount_percentage` is null, the app should display the deal description (e.g., "2 voor 3.49") rather than showing no savings indicator.

3. **Extend category keywords** - 88 products (7%) land in `overig`. Adding more AH-specific keyword mappings in `CATEGORY_KEYWORDS` (e.g., "kaassnacks" -> `snoep-chips`, "toiletpapier" -> `huishouden`) would reduce this.

4. **Paginate beyond 3,000 products** - The API hard-stops at page 15 (3,000 products) with a 400 error. If AH has bonus products beyond index 3,000 in their catalog, those are missed. Consider paginating with category filters to cover the full 10,000-product catalog in segments.

5. **Consider adding `requires_card: true`** as a hardcoded default for all AH products - all AH Bonus deals require the Bonuskaart, so setting this to `true` globally would be accurate even though the API doesn't expose it per-product.
