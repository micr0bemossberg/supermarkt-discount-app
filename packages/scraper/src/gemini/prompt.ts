import type { ExtractionContext } from './types';

export function buildExtractionPrompt(context: ExtractionContext): string {
  const { supermarketName, categorySlugList, promptHints } = context;

  const categoryList = categorySlugList.map((s) => `"${s}"`).join(', ');

  let prompt = `You are a Dutch supermarket discount data extractor. Analyze this image from ${supermarketName} and extract ALL discount/deal products visible.

Return a JSON array where each element has these fields:

REQUIRED:
- "title" (string): Product name in Dutch as shown on the image
- "discount_price" (number): The discounted sale price in EUR (e.g., 1.99)

OPTIONAL:
- "original_price" (number): Price before discount, if visible (must be >= discount_price)
- "discount_percentage" (number): Discount percentage 0-100, if shown (e.g., from "25% KORTING" badge)
- "description" (string): Product subtitle or variant info (e.g., "Diverse varianten", "500ml")
- "unit_info" (string): Unit or quantity info (e.g., "per kg", "per stuk", "2 voor €3", "500 ml")
- "valid_from" (string): Discount start date as YYYY-MM-DD, if visible (e.g., from "Geldig van 16 maart")
- "valid_until" (string): Discount end date as YYYY-MM-DD, if visible (e.g., from "t/m 22 maart")
- "category_slug" (string): One of: [${categoryList}]. Classify based on product type.
- "requires_card" (boolean): true if a loyalty card badge is visible (e.g., "Bonuskaart", "Extra's", "Voordeelkaart")
- "image_url" (string): URL of the individual product image, only if visible as a URL in the image
- "product_url" (string): URL to the product page, only if visible

RULES:
- Extract EVERY product visible in the image. Do not skip any.
- Prices are in euros. Use decimal point (1.99), not comma.
- For dates, convert Dutch month names: januari=01, februari=02, maart=03, april=04, mei=05, juni=06, juli=07, augustus=08, september=09, oktober=10, november=11, december=12.
- If dates are not visible in this image, set valid_from and valid_until to null.
- If you cannot determine a field, omit it or set to null.
- Return ONLY the JSON array. No markdown, no explanation, no code fences.`;

  if (promptHints) {
    prompt += `\n\nADDITIONAL CONTEXT:\n${promptHints}`;
  }

  return prompt;
}
