# Vomar Data Quality Report

**Date**: 2026-04-06
**Scraper**: PublitasOCRScraper (Gemini Vision OCR)
**Model**: gemini-3.1-flash-lite-preview (thinking: high, mediaResolution: HIGH)
**Publitas folder**: `online-weekfolder-week-15-vp_vrjweokb6` (week 15, 2026)

---

## Summary

| Metric | Value |
|---|---|
| Products extracted | **152** |
| Chunks processed | 39/39 (0 failed) |
| Publitas pages total | 39 |
| Pages skipped | 0 (cover page included per Vomar config) |
| Extraction rate | **100%** chunk success |
| Duplicates removed (by extractor) | 2 |
| Post-extraction duplicates | 0 |
| API keys used | 10 |
| Tokens consumed | 213,731 |
| Extraction duration | **93s** |
| Total scrape duration | ~150s (including browser + image download) |

**Products per page**: 3.9 avg (reasonable for flyer pages with mixed content/ads)

---

## Field Completeness

| Field | Filled | Empty | Invalid | Fill Rate |
|---|---|---|---|---|
| title | 152 | 0 | 0 | 100% |
| discount_price | 152 | 0 | 0 | 100% |
| original_price | 111 | 41 | 0 | 73% |
| discount_percentage | 111 | 41 | 1 | 73% |
| description | 121 | 31 | 0 | 80% |
| unit_info | 141 | 11 | 0 | 93% |
| valid_from | 152 | 0 | 0 | 100% |
| valid_until | 152 | 0 | 0 | 100% |
| category_slug | 152 | 0 | 0 | 100% |
| deal_type | 152 | 0 | 0 | 100% |
| requires_card | 152 | 0 | 0 | 100% |
| image_url | 142 | 10 | 0 | 93% |

**Required fields** (title, discount_price, requires_card): **100%** filled, 0 invalid.

**Notes on empty fields**:
- `original_price` / `discount_percentage` empty for 41 products: These are likely "stunt" or bundle deals where no original price is shown on the flyer (e.g., "2 voor 4.00").
- `description` empty for 31 products: Some flyer items only show title and price without additional detail.
- `unit_info` empty for 11 products: Not all products display weight/unit on the flyer.
- `image_url` empty for 10 products: Flyer pages where individual product images could not be isolated.

---

## Issues Found

### Critical (0)

None.

### Warning (3)

1. **Discount percentage mismatch** (1 product)
   - Product: "Optimel Drinkyoghurt" (#25)
   - Stated: 58%, Computed from prices: 50% (original 1.99, discount 0.99)
   - Severity: **Warning** -- The OCR likely read a "50%" badge as "58%" or the badge on the flyer shows a different calculation basis (e.g., per-unit vs multi-buy).

2. **Stale dates on 5 products** (valid_from = valid_until = 2026-03-25)
   - Products: "Maaltijd-salade Kip Caesar", "Kruimige Aardappelen", "Snacktomaten", "Conference Peren", "Vers-pakket Tomaten-soep"
   - These have both valid_from and valid_until set to 2026-03-25 (11 days ago), suggesting they are from a previous week's content still visible on a flyer page, or the OCR misread the date.
   - Severity: **Warning** -- These would appear as expired in the app. The `cleanup` command should deactivate them.

3. **Two Leifheit products with high prices** (59.99 and 79.99)
   - Both are "Leifheit Stoomreiniger CleanTenso Power" but with different prices (59.99/129.99 and 79.99/159.99).
   - Severity: **Warning (minor)** -- These are likely two different models, but the titles are identical. The different original prices confirm they are distinct products, but identical titles may confuse users. Not flagged as duplicates because prices differ.

### Info (2)

1. **Three distinct valid_from dates detected**: 2026-03-25 (5 products), 2026-04-05 (131 products), 2026-04-09 (16 products). The main week runs 04-05 to 04-12, with 16 products starting 04-09 (mid-week refresh) and 5 stale products from 03-25.

2. **Product_url is null for all products**: Expected for Publitas pipeline -- flyer images don't contain clickable links.

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| vlees-vis-vega | 21 | 13.8% |
| dranken | 19 | 12.5% |
| vers-gebak | 17 | 11.2% |
| groente-fruit | 14 | 9.2% |
| zuivel-eieren | 14 | 9.2% |
| huishouden | 11 | 7.2% |
| wonen-keuken | 11 | 7.2% |
| bewaren | 9 | 5.9% |
| persoonlijke-verzorging | 7 | 4.6% |
| snoep-chips | 7 | 4.6% |
| overig | 6 | 3.9% |
| diepvries | 6 | 3.9% |
| kleding-mode | 5 | 3.3% |
| ontbijt | 3 | 2.0% |
| sport-vrije-tijd | 2 | 1.3% |

Distribution looks reasonable for a Dutch supermarket flyer -- food categories dominate, non-food present but smaller.

## Deal Type Distribution

| Deal Type | Count | % |
|---|---|---|
| korting | 92 | 60.5% |
| stunt | 20 | 13.2% |
| x_voor_y | 13 | 8.6% |
| 1+1_gratis | 11 | 7.2% |
| dag_actie | 7 | 4.6% |
| overig | 5 | 3.3% |
| weekend_actie | 4 | 2.6% |

All deal types are from the valid set. "korting" (generic discount) dominates as expected.

## Price Statistics

| Metric | Value |
|---|---|
| Minimum | 0.69 |
| Maximum | 79.99 |
| Average | 5.09 |

Price range is reasonable. The 79.99 max is a Leifheit steam cleaner (non-food item).

---

## Sample Products

### Good Products

```json
{
  "title": "Kies & Mix Fruit",
  "discount_price": 4.00,
  "original_price": 6.98,
  "category_slug": "groente-fruit",
  "deal_type": "x_voor_y"
}
```

```json
{
  "title": "Noordwoudse Geraspte Kaas",
  "discount_price": 1.99,
  "original_price": 2.39,
  "category_slug": "zuivel-eieren",
  "deal_type": "korting"
}
```

```json
{
  "title": "Nivea Sun Zonbescherming",
  "discount_price": 5.99,
  "original_price": null,
  "category_slug": "persoonlijke-verzorging",
  "deal_type": "korting"
}
```

### Bad Products

```json
{
  "title": "Optimel Drinkyoghurt",
  "discount_price": 0.99,
  "original_price": 1.99,
  "discount_percentage": 58,
  "unit_info": "1 liter",
  "deal_type": "korting",
  "issue": "discount_percentage states 58% but computed is 50% (diff=8)"
}
```

---

## Overall Score: **A**

### Justification

| Criterion | Score | Notes |
|---|---|---|
| Chunk success rate | 39/39 (100%) | Perfect -- no failed API calls |
| Required field completeness | 100% | title, discount_price, requires_card all filled |
| Optional field completeness | 73-100% | Good coverage across all optional fields |
| Data validity | 151/152 (99.3%) | Only 1 product with percentage mismatch |
| Duplicate rate | 0/152 (0%) | No post-extraction duplicates |
| Category accuracy | 152/152 (100%) | All valid slugs |
| Deal type accuracy | 152/152 (100%) | All valid deal types |
| Date accuracy | 147/152 (96.7%) | 5 products with stale dates |
| Price reasonableness | 152/152 (100%) | All within expected range |
| Speed | 93s extraction | Fast for 39 pages |

**Overall: A** -- Excellent extraction quality. 152 products from 39 flyer pages with 100% chunk success, 99.3% data validity, and 0 duplicates. The only issues are minor: one discount percentage mismatch and 5 products with stale dates from a previous week.

---

## Recommendations

1. **Filter stale-dated products**: Add a post-processing step to discard or flag products where `valid_until` is before the scrape date. This would remove the 5 expired products automatically.

2. **Discount percentage validation**: Add a post-processing check that recalculates `discount_percentage` from `original_price` and `discount_price`, and corrects values with >5% deviation. This would fix the Optimel Drinkyoghurt issue.

3. **Identical title disambiguation**: When two products share the same title but have different prices/original_prices (like the two Leifheit steam cleaners), consider appending the description or variant info to the title for better user differentiation.

4. **Product URL**: Not applicable for Publitas pipeline. No action needed.
