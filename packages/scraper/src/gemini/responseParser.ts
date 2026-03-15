import type { ScrapedProduct } from '@supermarkt-deals/shared';

const ALL_CATEGORY_SLUGS = [
  'vers-gebak', 'vlees-vis-vega', 'zuivel-eieren', 'groente-fruit',
  'diepvries', 'dranken', 'bewaren', 'ontbijt', 'snoep-chips',
  'persoonlijke-verzorging', 'huishouden', 'baby-kind', 'elektronica',
  'wonen-keuken', 'sport-vrije-tijd', 'kleding-mode', 'overig',
];

function getCurrentWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getCurrentWeekSunday(): Date {
  const monday = getCurrentWeekMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

function coercePrice(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Handle Dutch comma-decimal: "1,99" → 1.99
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

function coerceDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function stripCodeFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

export function parseGeminiResponse(
  raw: string,
  validCategorySlugs: string[] = ALL_CATEGORY_SLUGS,
): ScrapedProduct[] {
  let parsed: unknown[];

  try {
    const cleaned = stripCodeFences(raw);
    const json = JSON.parse(cleaned);
    parsed = Array.isArray(json) ? json : [json];
  } catch {
    return [];
  }

  const products: ScrapedProduct[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;

    // Required fields
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const discountPrice = coercePrice(raw.discount_price);

    if (!title || !discountPrice || discountPrice <= 0) continue;

    // Optional price fields
    const originalPrice = coercePrice(raw.original_price);
    if (originalPrice !== undefined && originalPrice < discountPrice) continue;

    // Dates with fallback
    const validFrom = coerceDate(raw.valid_from) ?? getCurrentWeekMonday();
    const validUntil = coerceDate(raw.valid_until) ?? getCurrentWeekSunday();

    // Discount percentage
    let discountPercentage = typeof raw.discount_percentage === 'number'
      ? raw.discount_percentage
      : undefined;

    if (discountPercentage === undefined && originalPrice && discountPrice) {
      discountPercentage = Math.round((1 - discountPrice / originalPrice) * 100);
    }

    // Category validation
    let categorySlug = typeof raw.category_slug === 'string'
      ? raw.category_slug
      : undefined;

    if (categorySlug && !validCategorySlugs.includes(categorySlug)) {
      categorySlug = 'overig';
    }

    products.push({
      title,
      discount_price: discountPrice,
      original_price: originalPrice,
      discount_percentage: discountPercentage,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      unit_info: typeof raw.unit_info === 'string' ? raw.unit_info : undefined,
      image_url: typeof raw.image_url === 'string' ? raw.image_url : undefined,
      product_url: typeof raw.product_url === 'string' ? raw.product_url : undefined,
      valid_from: validFrom,
      valid_until: validUntil,
      category_slug: categorySlug,
      requires_card: typeof raw.requires_card === 'boolean' ? raw.requires_card : false,
    });
  }

  return products;
}
