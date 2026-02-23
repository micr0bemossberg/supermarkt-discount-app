/**
 * Products Service
 * API layer for fetching products from Supabase
 */

import { supabase } from '../config/supabase';
import type { Product, ProductWithRelations, ProductFilters } from '@supermarkt-deals/shared';

// Fish keywords - fish is always halal
const FISH_KEYWORDS = [
  'vis', 'zalm', 'tonijn', 'garnaal', 'garnalen', 'haring', 'makreel',
  'kabeljauw', 'schelvis', 'pangasius', 'tilapia', 'forel', 'sardine',
  'sardien', 'mosselen', 'kibbeling', 'lekkerbek', 'visstick', 'fishstick',
  'calamari', 'inktvis', 'kreeft', 'krab', 'scampi', 'ansjovis', 'zeebaars',
  'dorade', 'schol', 'scholfilet', 'koolvis', 'wijting', 'heek', 'paling',
  'zeewolf', 'victoriabaars', 'sushi', 'norsk',
];

// Vegan/vegetarian keywords - no meat, always fine
const VEGA_KEYWORDS = [
  'vega', 'vegetarisch', 'vegan', 'plantaardig', 'tofu', 'tempeh',
  'seitan', 'beyond', 'impossible', 'groenteburger', 'bonenkroket',
];

// Exclude female-specific products (make-up, perfume, lingerie, skincare, etc.)
const FEMALE_EXCLUDE_KEYWORDS = [
  'mascara', 'lippenstift', 'lipstick', 'lipgloss', 'lip gloss',
  'foundation', 'concealer', 'blush', 'rouge', 'oogschaduw', 'eyeshadow',
  'eyeliner', 'wenkbrauw', 'make-up', 'make up', 'makeup',
  'nagellak', 'nail polish', 'gelnagel',
  'parfum', 'perfume', 'eau de toilette', 'eau de parfum', 'body mist',
  'lingerie', 'beha', 'bh ', 'string', 'slip dames',
  'tampon', 'maandverband', 'inlegkruisje',
  'gezichtscrème', 'gezichtscreme', 'dagcrème', 'dagcreme', 'nachtcrème', 'nachtcreme',
  'serum', 'toner', 'micellair', 'micellar', 'reinigingsmelk',
  'gezichtsmasker', 'face mask', 'sheet mask', 'peel off',
  'anti-rimpel', 'anti rimpel', 'retinol', 'hyaluron',
  'bb cream', 'cc cream', 'primer',
  'wax strip', 'ontharings', 'epileer', 'epilator',
];

/**
 * Filter out non-halal meat products.
 * Keeps: fish (always halal), explicitly halal-labeled, and vegan/vegetarian products.
 * Removes: other meat products from the "vlees-vis-vega" category.
 */
function filterHalalOnly(products: ProductWithRelations[]): ProductWithRelations[] {
  return products.filter((product) => {
    // Only filter products in the meat/fish/vega category
    if (product.category?.slug !== 'vlees-vis-vega') {
      return true;
    }

    const title = product.title.toLowerCase();

    // Keep if explicitly labeled halal
    if (title.includes('halal')) {
      return true;
    }

    // Keep if it's a fish product
    if (FISH_KEYWORDS.some((kw) => title.includes(kw))) {
      return true;
    }

    // Keep if it's vegan/vegetarian
    if (VEGA_KEYWORDS.some((kw) => title.includes(kw))) {
      return true;
    }

    // Filter out non-halal meat
    return false;
  });
}

/**
 * Filter out female-specific products (make-up, perfume, lingerie, skincare, etc.)
 */
function filterExcludeFemale(products: ProductWithRelations[]): ProductWithRelations[] {
  return products.filter((product) => {
    const title = product.title.toLowerCase();
    return !FEMALE_EXCLUDE_KEYWORDS.some((kw) => title.includes(kw));
  });
}

/**
 * Fetch products with optional filters
 */
export async function getProducts(
  filters?: ProductFilters
): Promise<ProductWithRelations[]> {
  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        supermarket:supermarkets(*),
        category:categories(*)
      `)
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.supermarket_ids && filters.supermarket_ids.length > 0) {
      query = query.in('supermarket_id', filters.supermarket_ids);
    }

    if (filters?.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    if (filters?.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    if (filters?.min_discount) {
      query = query.gte('discount_percentage', filters.min_discount);
    }

    if (filters?.max_price) {
      query = query.lte('discount_price', filters.max_price);
    }

    // Pagination
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }

    const halal = filterHalalOnly((data || []) as ProductWithRelations[]);
    return filterExcludeFemale(halal);
  } catch (error) {
    console.error('Failed to fetch products:', error);
    throw error;
  }
}

/**
 * Fetch a single product by ID
 */
export async function getProductById(id: string): Promise<ProductWithRelations | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        supermarket:supermarkets(*),
        category:categories(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching product:', error);
      throw error;
    }

    return data as ProductWithRelations;
  } catch (error) {
    console.error('Failed to fetch product:', error);
    return null;
  }
}

/**
 * Search products by query
 */
export async function searchProducts(
  query: string,
  limit: number = 20
): Promise<ProductWithRelations[]> {
  return getProducts({
    search: query,
    limit,
  });
}

/**
 * Get total count of active products
 */
export async function getProductsCount(filters?: ProductFilters): Promise<number> {
  try {
    let query = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString().split('T')[0]);

    if (filters?.supermarket_ids && filters.supermarket_ids.length > 0) {
      query = query.in('supermarket_id', filters.supermarket_ids);
    }

    if (filters?.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error counting products:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Failed to count products:', error);
    return 0;
  }
}
