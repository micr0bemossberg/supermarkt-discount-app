/**
 * Deduplication Utility
 * Generates unique hashes for products to prevent duplicates
 */

import crypto from 'crypto';
import type { SupermarketSlug } from '@supermarkt-deals/shared';

/**
 * Generate a unique hash for a product
 * Hash is based on: supermarket + title + valid_from + valid_until
 *
 * This ensures we don't create duplicates when re-running scraper,
 * but allows the same product to appear in different time periods
 */
export function generateProductHash(
  supermarketSlug: SupermarketSlug,
  title: string,
  validFrom: Date,
  validUntil: Date
): string {
  // Normalize title (lowercase, trim, remove extra spaces)
  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');

  // Format dates as YYYY-MM-DD
  const fromStr = validFrom.toISOString().split('T')[0];
  const untilStr = validUntil.toISOString().split('T')[0];

  // Combine into single string
  const hashInput = `${supermarketSlug}:${normalizedTitle}:${fromStr}:${untilStr}`;

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Normalize product title for comparison
 * Useful for deduplication and search
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/[^\w\s-]/g, ''); // Remove special characters except hyphens
}

/**
 * Extract numeric price from string
 * Handles various formats: "€1,99", "1.99", "1,99 per stuk"
 */
export function parsePrice(priceString: string | null | undefined): number | null {
  if (!priceString) return null;

  // Remove currency symbols and whitespace
  const cleaned = priceString
    .replace(/[€$£\s]/g, '')
    .replace(',', '.') // Convert comma to dot
    .trim();

  // Extract first number
  const match = cleaned.match(/\d+\.?\d*/);
  if (!match) return null;

  const price = parseFloat(match[0]);
  return isNaN(price) ? null : price;
}

/**
 * Calculate discount percentage from original and discount prices
 */
export function calculateDiscountPercentage(
  originalPrice: number,
  discountPrice: number
): number {
  if (originalPrice <= 0 || discountPrice <= 0) return 0;
  if (discountPrice >= originalPrice) return 0;

  const percentage = Math.round(
    ((originalPrice - discountPrice) / originalPrice) * 100
  );

  return Math.max(0, Math.min(100, percentage)); // Clamp between 0-100
}

/**
 * Validate that a product has required fields
 */
export function isValidProduct(product: {
  title?: string;
  discount_price?: number;
  valid_from?: Date;
  valid_until?: Date;
}): boolean {
  if (!product.title || product.title.trim().length === 0) {
    return false;
  }

  if (!product.discount_price || product.discount_price <= 0) {
    return false;
  }

  if (!product.valid_from || !product.valid_until) {
    return false;
  }

  if (product.valid_until < product.valid_from) {
    return false;
  }

  return true;
}
