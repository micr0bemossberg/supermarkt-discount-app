/**
 * Shared Types Package
 * Exports all TypeScript types used across scraper and mobile app
 */

// Supermarket types
export type { Supermarket, SupermarketSlug } from './types/Supermarket';

// Category types
export type { Category, CategorySlug } from './types/Category';

// Product types
export type {
  Product,
  ProductWithRelations,
  ProductFilters,
} from './types/Product';

// Scraped product types
export type {
  ScrapedProduct,
  ScrapeResult,
  ScrapeLog,
} from './types/ScrapedProduct';

// User favorite types
export type { UserFavorite } from './types/UserFavorite';
