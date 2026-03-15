import type { ExtractionContext } from './types';

export function buildExtractionPrompt(context: ExtractionContext): string {
  const { supermarketName, categorySlugList, promptHints } = context;

  const categoryList = categorySlugList.map((s) => `"${s}"`).join(', ');

  let prompt = `Analyze this image from ${supermarketName} and extract ALL discount/deal products visible.

For each product, extract:
- The product name (title) in Dutch exactly as shown
- The discounted sale price in EUR (use decimal point: 1.99, not comma)
- Original price before discount, if visible
- Discount percentage from badges like "25% KORTING", if visible
- Product description or variant info (e.g., "Diverse varianten", "500ml")
- Unit/quantity info (e.g., "per kg", "per stuk", "2 voor €3")
- Validity dates: look for "Geldig van ... t/m ..." text. Convert Dutch months: januari=01, februari=02, maart=03, april=04, mei=05, juni=06, juli=07, augustus=08, september=09, oktober=10, november=11, december=12. Format as YYYY-MM-DD. Set to null if not visible.
- Category: classify each product as one of: [${categoryList}]
- Loyalty card requirement: set requires_card to true if a loyalty badge is visible (e.g., "Bonuskaart", "Extra's", "Voordeelkaart")

RULES:
- Extract EVERY product visible. Do not skip any.
- If you cannot determine a field, set it to null.
- Be precise with prices — read the exact numbers shown.`;

  if (promptHints) {
    prompt += `\n\nADDITIONAL CONTEXT:\n${promptHints}`;
  }

  return prompt;
}
