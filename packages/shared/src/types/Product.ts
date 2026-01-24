/**
 * Product Type
 * Represents a discount product from a supermarket
 */

import { Supermarket } from './Supermarket';
import { Category } from './Category';

export interface Product {
  id: string;
  supermarket_id: string;
  category_id: string | null;

  // Product information
  title: string;
  description: string | null;

  // Pricing
  original_price: number | null;
  discount_price: number;
  discount_percentage: number | null;

  // Images
  image_url: string | null;
  image_storage_path: string | null;

  // Additional info
  product_url: string | null;
  unit_info: string | null; // e.g., "per kg", "500g"

  // Validity
  valid_from: string; // ISO date string
  valid_until: string; // ISO date string

  // Status
  is_active: boolean;

  // Deduplication
  scrape_hash: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Relations (when fetched with joins)
  supermarket?: Supermarket;
  category?: Category;
}

/**
 * Product with required relations
 * Used when fetching products with supermarket and category joins
 */
export interface ProductWithRelations extends Omit<Product, 'supermarket' | 'category'> {
  supermarket: Supermarket;
  category: Category | null;
}

/**
 * Product filters for API queries
 */
export interface ProductFilters {
  supermarket_ids?: string[];
  category_id?: string | null;
  search?: string;
  min_discount?: number;
  max_price?: number;
  valid_on?: string; // ISO date string
  limit?: number;
  offset?: number;
}
