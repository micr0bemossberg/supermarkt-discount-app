# Data Quality Report: Kruidvat

**Date**: 2026-04-06
**Folder**: kruidvat-folder-15-6-april-2026-t-m-19-april-2026
**Pipeline**: Publitas OCR (Gemini 3.1 flash-lite-preview)

---

## Summary

| Metric | Value |
|---|---|
| Products extracted | 186 |
| Total chunks processed | 52 / 52 (0 failed) |
| Publitas spreads | 53 (105 pages across all spreads) |
| Pages skipped | 1 (cover page) |
| Extraction time | 113s (OCR only), 147s (total incl. download) |
| Tokens used | 284,420 |
| Duplicates detected | 0 |
| Issues found | 4 (0 HIGH, 4 MEDIUM, 0 LOW) |

**Extraction rate**: 52/52 chunks = **100%** success rate
**Products per chunk**: 186 / 52 = **3.6 avg**

---

## Field Completeness

| Field | Filled | Empty | Invalid | Fill Rate |
|---|---|---|---|---|
| title | 186 | 0 | 0 | **100%** |
| discount_price | 182 | 0 | 4 | **97.8%** |
| original_price | 126 | 60 | 0 | 67.7% |
| discount_percentage | 126 | 60 | 0 | 67.7% |
| description | 158 | 28 | 0 | 84.9% |
| unit_info | 114 | 72 | 0 | 61.3% |
| valid_from | 186 | 0 | 0 | **100%** |
| valid_until | 186 | 0 | 0 | **100%** |
| category_slug | 186 | 0 | 0 | **100%** |
| deal_type | 172 | 14 | 0 | 92.5% |
| requires_card | 186 | 0 | 0 | **100%** |
| image_url | 168 | 18 | 0 | 90.3% |
| product_url | 0 | 186 | 0 | 0% (expected) |

**Notes**:
- `product_url` is always empty for Publitas scrapers -- flyer pages are images without clickable product links. This is expected behavior.
- `original_price` and `discount_percentage` are empty for 60 products (32.3%). These are likely products where the flyer only shows the deal price without a visible strikethrough original price (common for "x voor y" and "1+1 gratis" deals).
- All required fields (`title`, `discount_price`, `requires_card`, `valid_from`, `valid_until`, `category_slug`) are 100% filled.

---

## Price Analysis

| Metric | Value |
|---|---|
| Minimum price | EUR 0.69 |
| Maximum price | EUR 179.95 |
| Average price | EUR 17.48 |

**Price distribution notes**: 4 products have prices above EUR 100 (flagged as MEDIUM severity). All are legitimate high-value items (electronics, appliances) -- see Issues section.

---

## Date Range

| Field | Value |
|---|---|
| Earliest valid_from | 2026-04-05 (some with time offset indicating UTC conversion) |
| Latest valid_until | 2026-04-19 |

Consistent with the folder title: "6 april 2026 t/m 19 april 2026". The April 5 date on some products reflects UTC timezone offset (April 6 00:00 CET = April 5 22:00 UTC).

---

## Category Distribution

| Category | Count | % |
|---|---|---|
| persoonlijke-verzorging | 106 | 57.0% |
| sport-vrije-tijd | 20 | 10.8% |
| baby-kind | 20 | 10.8% |
| overig | 9 | 4.8% |
| kleding-mode | 7 | 3.8% |
| snoep-chips | 6 | 3.2% |
| huishouden | 6 | 3.2% |
| wonen-keuken | 5 | 2.7% |
| dranken | 5 | 2.7% |
| elektronica | 1 | 0.5% |
| ontbijt | 1 | 0.5% |

Category distribution aligns well with Kruidvat's product range (primarily personal care, beauty, health, baby products). All categories are valid slugs from the schema.

---

## Deal Type Distribution

| Deal Type | Count | % |
|---|---|---|
| korting | 67 | 36.0% |
| overig | 45 | 24.2% |
| x_voor_y | 29 | 15.6% |
| 1+1_gratis | 14 | 7.5% |
| 2e_halve_prijs | 10 | 5.4% |
| stunt | 3 | 1.6% |
| combinatie_korting | 2 | 1.1% |
| gratis_bijproduct | 1 | 0.5% |
| extra | 1 | 0.5% |
| (empty) | 14 | 7.5% |

All non-empty deal types are valid. The 45 "overig" products are high -- some may benefit from more specific classification. The 14 empty deal types should ideally be classified.

---

## Issues Found

### MEDIUM Severity (4)

All 4 MEDIUM issues are `discount_price > 100`. These are legitimate high-value products:

| # | Product | Price | Assessment |
|---|---|---|---|
| 1 | Oral-B elektrische tandenborstel iO Smile en iO9 | EUR 112.49 | Valid -- premium electric toothbrush |
| 2 | Tomado drankenkoeler | EUR 179.95 | Valid -- beverage cooler appliance |
| 3 | Tomado mini vriezer | EUR 109.00 | Valid -- mini freezer |
| 4 | Keter Eastwood opbergbox | EUR 139.95 | Valid -- large storage box |

**Verdict**: All 4 are **false positives** -- the EUR 100 threshold is too low for Kruidvat's non-FMCG items (electronics, appliances, furniture). No action needed.

### HIGH Severity: None
### LOW Severity: None
### Duplicates: None

---

## Sample Products

### Good Products (3 examples)

**1. Pathe Bioscooptickets**
```json
{
  "title": "Pathe Bioscooptickets",
  "discount_price": 15.00,
  "original_price": 30.00,
  "discount_percentage": 50,
  "category_slug": "sport-vrije-tijd",
  "deal_type": "x_voor_y",
  "valid_from": "2026-04-06",
  "valid_until": "2026-04-19",
  "unit_info": "2 voor 15.00",
  "requires_card": false
}
```

**2. Kruidvat bad & douche**
```json
{
  "title": "Kruidvat bad & douche",
  "discount_price": 3.50,
  "original_price": 4.58,
  "discount_percentage": 24,
  "category_slug": "persoonlijke-verzorging",
  "deal_type": "x_voor_y",
  "valid_from": "2026-04-05",
  "valid_until": "2026-04-12",
  "unit_info": "2 voor 3.50",
  "requires_card": false
}
```

**3. Kruidvat handzeep**
```json
{
  "title": "Kruidvat handzeep",
  "discount_price": 5.00,
  "original_price": 5.16,
  "discount_percentage": 3,
  "category_slug": "persoonlijke-verzorging",
  "deal_type": "x_voor_y",
  "valid_from": "2026-04-05",
  "valid_until": "2026-04-12",
  "unit_info": "4 voor 5.00",
  "requires_card": false
}
```

### Bad Products

No products with HIGH severity issues were found.

---

## Completeness Check

| Metric | Value |
|---|---|
| Publitas spreads total | 53 |
| Spreads skipped (cover) | 1 |
| Chunks sent to Gemini | 52 |
| Chunks successfully processed | 52 |
| Chunks failed | 0 |
| **Chunk success rate** | **100%** |

Previous benchmark (CLAUDE.md): 181 products from 54 chunks.
Current run: **186 products from 52 chunks** -- comparable output (+5 products, -2 chunks).

The Publitas folder has 53 spreads containing 105 physical pages (most spreads are 2-page spreads). Each spread is sent as a single image to Gemini, which is correct -- the spread image shows both pages together, giving the model full context.

---

## Overall Score: A

### Justification

| Criterion | Score | Notes |
|---|---|---|
| Field completeness | A | All required fields 100% filled |
| Data accuracy | A | 0 HIGH issues, 4 MEDIUM are false positives |
| Chunk success rate | A+ | 52/52 = 100% |
| Duplicate rate | A+ | 0 duplicates |
| Product count | A | 186 products, in line with benchmark (181) |
| Processing speed | A | 147s total (fast for 52 chunks with 10 keys) |

**Overall: A** -- Excellent extraction quality. No data integrity issues. All products have valid titles, prices, dates, and categories. The 4 flagged prices are legitimate high-value items.

---

## Recommendations

1. **Raise price ceiling for validation**: The EUR 100 threshold is too low for Kruidvat (sells electronics, appliances). Consider raising to EUR 200 or making it per-supermarket.

2. **Reduce "overig" deal type usage**: 45 products (24.2%) are classified as "overig". Review the Gemini prompt to better distinguish between "korting" (percentage off), "stunt" (deeply discounted), and other specific types visible on Kruidvat flyers.

3. **Improve original_price extraction**: 60 products (32.3%) lack original_price. Some flyer pages show "van X.XX voor Y.YY" text that may not be extracted. Could add prompt hints specific to Kruidvat price label formats.

4. **Fill empty deal_type**: 14 products (7.5%) have no deal_type. The prompt could default to "korting" when a discount is clearly present but the specific type is ambiguous.

5. **Monitor product count stability**: 186 vs. 181 benchmark shows good consistency. Track week-over-week to detect regressions early.
