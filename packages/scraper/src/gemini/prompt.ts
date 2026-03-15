import type { ExtractionContext } from './types';

export function buildExtractionPrompt(context: ExtractionContext): string {
  const { supermarketName, categorySlugList, promptHints } = context;

  const categoryList = categorySlugList.map((s) => `"${s}"`).join(', ');

  let prompt = `Analyze this image from ${supermarketName} and extract ALL discount/deal products visible.

IMPORTANT — VALIDITY DATES:
Look carefully at the ENTIRE image for date information. Dutch supermarkets show validity dates in headers, banners, or tabs — often as:
- "Geldig van ... t/m ..."
- "tot en met [dag] [datum]" (e.g., "tot en met DI 17 maart" means valid_until = 2026-03-17)
- "vanaf [dag] [datum]" (e.g., "vanaf WO 18 maart" means valid_from = 2026-03-18)
- "Aanbiedingen tot en met dinsdag" with a date
- Week indicators like "Week 12" or "ma 10 t/m zo 16 maart"

The current year is 2026. Convert Dutch day abbreviations: ma=Monday, di=Tuesday, wo=Wednesday, do=Thursday, vr=Friday, za=Saturday, zo=Sunday.
Convert Dutch months: januari=01, februari=02, maart=03, april=04, mei=05, juni=06, juli=07, augustus=08, september=09, oktober=10, november=11, december=12.
Format dates as YYYY-MM-DD. Apply the SAME dates to ALL products on the page.

For each product, extract ALL of these fields (use null when not determinable):
- title: Product name in Dutch exactly as shown
- discount_price: The discounted sale price in EUR (decimal point: 1.99, not comma)
- original_price: Price before discount (look for "van X.XX" or crossed-out prices), null if not visible
- discount_percentage: From badges like "25% KORTING" or "2e halve prijs", null if not shown
- description: Product subtitle, variant info, or weight (e.g., "Diverse varianten", "400 g"), null if none
- unit_info: Unit/quantity (e.g., "per kg", "per stuk", "2 voor €3", "1,5 kg", "Per schaal."), null if none
- valid_from: Start date YYYY-MM-DD from page header/banner, null if not visible
- valid_until: End date YYYY-MM-DD from page header/banner, null if not visible
- category_slug: Classify as one of: [${categoryList}]
- requires_card: true if loyalty card badge visible (Bonuskaart, Extra's, Voordeelkaart), false otherwise
- image_url: null (not extractable from screenshots)
- product_url: null (not extractable from screenshots)

RULES:
- Extract EVERY product visible. Do not skip any.
- ALWAYS return ALL 12 fields for every product, even if the value is null.
- Be precise with prices — read the exact numbers shown.
- Look for "van X.XX" text near prices — this is the original_price.`;

  if (promptHints) {
    prompt += `\n\nADDITIONAL CONTEXT:\n${promptHints}`;
  }

  return prompt;
}
