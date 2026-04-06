# Data Quality Validation Plan

## Doel
Elke supermarkt scraper output valideren op correctheid en volledigheid door een team van gespecialiseerde agents.

## Agent Team

### 1. Scraper Runner Agent
- Draait de scraper voor 1 supermarkt (`--dry-run --output=<file>.json`)
- Rapporteert: aantal producten, chunks, duration, errors
- Slaat output op in `docs/data-quality/output/<supermarkt>.json`

### 2. Data Validator Agent
- Leest de JSON output en valideert elk product op:
  - **Verplichte velden**: title (niet leeg), discount_price (> 0)
  - **Prijsconsistentie**: original_price >= discount_price (als aanwezig)
  - **Datum validiteit**: valid_from <= valid_until, beide in huidige/komende week
  - **Percentage check**: als discount_percentage aanwezig, klopt het met (original - discount) / original * 100?
  - **Category check**: category_slug is een van: vers-gebak, vlees-vis-vega, zuivel-eieren, groente-fruit, diepvries, dranken, bewaren, ontbijt, snoep-chips, persoonlijke-verzorging, huishouden, baby-kind, elektronica, wonen-keuken, sport-vrije-tijd, kleding-mode, overig
  - **Deal type check**: deal_type is een van de bekende types (korting, 1+1_gratis, etc.)
  - **URL check**: product_url is een valide URL (als aanwezig)
  - **Duplicaten**: geen duplicate titels met dezelfde prijs
- Rapporteert: pass/fail per veld, percentage compleet, flagged issues

### 3. Completeness Checker Agent
- Vergelijkt OCR output met wat er daadwerkelijk op de website/flyer staat
- Navigeert naar de supermarkt pagina en telt DOM producten (of Publitas pages)
- Berekent: extraction rate = OCR producten / werkelijke producten
- Identificeert missende producten (als mogelijk)

### 4. Reviewer Agent
- Ontvangt rapporten van alle 3 agents
- Maakt een samenvattend rapport per supermarkt
- Geeft een overall score (A/B/C/D/F) per supermarkt
- Identificeert de top-3 verbeterpunten per supermarkt
- Schrijft het finale rapport naar `docs/data-quality/reports/<supermarkt>.md`

## Supermarkten te valideren

### Prioriteit 1 (Publitas OCR - primaire pipeline)
1. Vomar (219 producten verwacht)
2. DekaMarkt (69 producten verwacht)
3. Kruidvat (181 producten verwacht)
4. Hanos (nieuw)
5. Makro (nieuw)
6. Sligro (nieuw)

### Prioriteit 2 (Screenshot OCR)
7. Dirk (459 producten verwacht)
8. Jumbo (130 producten verwacht)
9. Aldi (48 producten verwacht)
10. Action (129 producten verwacht)
11. Hoogvliet (76 producten verwacht)
12. Megafoodstunter (7 producten verwacht)

### Prioriteit 3 (API)
13. AH (~1000+ producten)

## Output Structuur

```
docs/data-quality/
  validation-plan.md          # Dit document
  output/                     # Raw scraper JSON output
    vomar.json
    dekamarkt.json
    ...
  reports/                    # Validatie rapporten per supermarkt
    vomar.md
    dekamarkt.md
    ...
  summary.md                  # Overall samenvatting met scores
```

## Validatie Criteria

### Score Systeem
- **A** (90-100%): Alle velden correct, extraction rate >90%, geen critical issues
- **B** (75-89%): Minor issues (missende optionele velden), extraction rate >75%
- **C** (50-74%): Significant issues (verkeerde prijzen, lage extraction rate)
- **D** (25-49%): Major issues (veel missende producten, structurele fouten)
- **F** (<25%): Scraper werkt niet of levert onbruikbare data

### Critical Issues (auto-fail naar D of lager)
- discount_price = 0 of negatief
- title is leeg of bevat alleen whitespace
- valid_until < valid_from
- Meer dan 50% duplicate producten
