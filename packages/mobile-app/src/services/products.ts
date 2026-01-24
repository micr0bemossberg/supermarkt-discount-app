/**
 * Products Service
 * API layer for fetching products from Supabase
 */

import { supabase } from '../config/supabase';
import type { Product, ProductWithRelations, ProductFilters } from '@supermarkt-deals/shared';

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

    return (data || []) as ProductWithRelations[];
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
