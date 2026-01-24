/**
 * Products Database Layer
 * Functions for inserting and updating products in Supabase
 */

import { supabase } from '../config/supabase';
import { createLogger } from '../utils/logger';
import { generateProductHash } from '../utils/deduplication';
import type { ScrapedProduct, Product, SupermarketSlug } from '@supermarkt-deals/shared';

const logger = createLogger('ProductsDB');

/**
 * Get supermarket ID from slug
 */
export async function getSupermarketId(slug: SupermarketSlug): Promise<string | null> {
  const { data, error } = await supabase
    .from('supermarkets')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    logger.error(`Failed to get supermarket ID for slug: ${slug}`, error);
    return null;
  }

  return data.id;
}

/**
 * Get category ID from slug
 */
export async function getCategoryId(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return null; // Category is optional
  }

  return data.id;
}

/**
 * Check if product with given hash already exists
 */
export async function productExists(hash: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('scrape_hash', hash)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Product;
}

/**
 * Insert a new product
 */
export async function insertProduct(
  scrapedProduct: ScrapedProduct,
  supermarketSlug: SupermarketSlug,
  imageUrl?: string,
  imagePath?: string
): Promise<Product | null> {
  try {
    // Get supermarket ID
    const supermarketId = await getSupermarketId(supermarketSlug);
    if (!supermarketId) {
      logger.error(`Supermarket not found: ${supermarketSlug}`);
      return null;
    }

    // Get category ID (optional)
    let categoryId: string | null = null;
    if (scrapedProduct.category_slug) {
      categoryId = await getCategoryId(scrapedProduct.category_slug);
    }

    // Generate hash for deduplication
    const hash = generateProductHash(
      supermarketSlug,
      scrapedProduct.title,
      scrapedProduct.valid_from,
      scrapedProduct.valid_until
    );

    // Check if already exists
    const existing = await productExists(hash);
    if (existing) {
      logger.debug(`Product already exists: ${scrapedProduct.title}`);
      return existing;
    }

    // Prepare product data
    const productData = {
      supermarket_id: supermarketId,
      category_id: categoryId,
      title: scrapedProduct.title,
      description: scrapedProduct.description || null,
      original_price: scrapedProduct.original_price || null,
      discount_price: scrapedProduct.discount_price,
      discount_percentage: scrapedProduct.discount_percentage || null,
      image_url: imageUrl || scrapedProduct.image_url || null,
      image_storage_path: imagePath || null,
      product_url: scrapedProduct.product_url || null,
      unit_info: scrapedProduct.unit_info || null,
      valid_from: scrapedProduct.valid_from.toISOString().split('T')[0],
      valid_until: scrapedProduct.valid_until.toISOString().split('T')[0],
      is_active: true,
      scrape_hash: hash,
    };

    // Insert into database
    const { data, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to insert product: ${scrapedProduct.title}`, error);
      return null;
    }

    logger.success(`Inserted product: ${scrapedProduct.title}`);
    return data as Product;
  } catch (error) {
    logger.error(`Error inserting product`, error);
    return null;
  }
}

/**
 * Update an existing product
 */
export async function updateProduct(
  productId: string,
  updates: Partial<Product>
): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to update product: ${productId}`, error);
      return null;
    }

    logger.success(`Updated product: ${productId}`);
    return data as Product;
  } catch (error) {
    logger.error(`Error updating product`, error);
    return null;
  }
}

/**
 * Deactivate expired products
 * Returns count of deactivated products
 */
export async function deactivateExpiredProducts(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('products')
      .update({ is_active: false })
      .lt('valid_until', today)
      .eq('is_active', true)
      .select('id');

    if (error) {
      logger.error('Failed to deactivate expired products', error);
      return 0;
    }

    const count = data?.length || 0;
    logger.info(`Deactivated ${count} expired products`);
    return count;
  } catch (error) {
    logger.error('Error deactivating expired products', error);
    return 0;
  }
}

/**
 * Get count of active products for a supermarket
 */
export async function getActiveProductCount(
  supermarketSlug: SupermarketSlug
): Promise<number> {
  const supermarketId = await getSupermarketId(supermarketSlug);
  if (!supermarketId) return 0;

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('supermarket_id', supermarketId)
    .eq('is_active', true);

  if (error) {
    logger.error('Failed to get product count', error);
    return 0;
  }

  return count || 0;
}

/**
 * Batch insert products with better performance
 */
export async function insertProductsBatch(
  scrapedProducts: Array<{
    product: ScrapedProduct;
    imageUrl?: string;
    imagePath?: string;
  }>,
  supermarketSlug: SupermarketSlug
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const { product, imageUrl, imagePath } of scrapedProducts) {
    const result = await insertProduct(product, supermarketSlug, imageUrl, imagePath);
    if (result) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return { inserted, skipped };
}
