/**
 * ScrapedProduct Type
 * Represents raw product data extracted from supermarket websites
 * Before being stored in the database
 */

export interface ScrapedProduct {
  // Product information
  title: string;
  description?: string;

  // Pricing
  original_price?: number;
  discount_price: number;
  discount_percentage?: number;

  // Images
  image_url?: string;

  // Additional info
  product_url?: string;
  unit_info?: string;

  // Validity
  valid_from: Date;
  valid_until: Date;

  // Category (if detected during scraping)
  category_slug?: string;
}

/**
 * Scrape result
 * Returned by each scraper after execution
 */
export interface ScrapeResult {
  success: boolean;
  supermarket_slug: string;
  products_scraped: number;
  products_inserted: number;
  products_updated: number;
  duration_seconds: number;
  error_message?: string;
  error_screenshot_path?: string;
}

/**
 * Scrape log entry
 * Stored in database for monitoring
 */
export interface ScrapeLog {
  id: string;
  supermarket_id: string | null;
  status: 'success' | 'failed' | 'partial';
  products_scraped: number;
  error_message: string | null;
  duration_seconds: number | null;
  created_at: string;
}
