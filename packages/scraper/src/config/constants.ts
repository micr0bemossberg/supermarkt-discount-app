/**
 * Scraper Constants and Configuration
 */

import type { SupermarketSlug } from '@supermarkt-deals/shared';

// Scraper behavior
export const SCRAPER_CONFIG = {
  // Delays and timing
  MIN_DELAY_MS: 2000, // Minimum delay between requests (2 seconds)
  MAX_DELAY_MS: 5000, // Maximum delay between requests (5 seconds)
  PAGE_TIMEOUT_MS: 30000, // Page load timeout (30 seconds)

  // Retry logic
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,

  // Browser settings
  HEADLESS: process.env.HEADLESS !== 'false', // Default true, set to 'false' for debugging
  SCREENSHOT_ON_ERROR: process.env.SCREENSHOT_ON_ERROR !== 'false',
  SCREENSHOTS_DIR: './screenshots',

  // User agents for rotation
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ],
};

// Supermarket configurations
export const SUPERMARKET_URLS: Record<SupermarketSlug, string> = {
  ah: 'https://www.ah.nl/bonus',
  jumbo: 'https://www.jumbo.com/aanbiedingen',
  lidl: 'https://www.lidl.nl/aanbiedingen',
  aldi: 'https://www.aldi.nl/aanbiedingen',
  plus: 'https://www.plus.nl/aanbiedingen',
};

// Image processing
export const IMAGE_CONFIG = {
  MAX_WIDTH: 800,
  MAX_HEIGHT: 800,
  QUALITY: 85,
  FORMAT: 'webp' as const,
  MAX_FILE_SIZE_MB: 5,
};

// Supabase Storage
export const STORAGE_CONFIG = {
  BUCKET_NAME: 'product-images',
  PATH_TEMPLATE: '{supermarket}/{year}/{month}/{hash}.webp',
};

// Category mapping keywords (Dutch to slug)
export const CATEGORY_KEYWORDS: Record<string, string> = {
  // Vers & Gebak
  'brood': 'vers-gebak',
  'gebak': 'vers-gebak',
  'banket': 'vers-gebak',

  // Vlees, Vis & Vega
  'vlees': 'vlees-vis-vega',
  'vis': 'vlees-vis-vega',
  'vega': 'vlees-vis-vega',
  'vegetarisch': 'vlees-vis-vega',
  'kip': 'vlees-vis-vega',
  'rund': 'vlees-vis-vega',

  // Zuivel & Eieren
  'melk': 'zuivel-eieren',
  'kaas': 'zuivel-eieren',
  'yoghurt': 'zuivel-eieren',
  'eieren': 'zuivel-eieren',
  'boter': 'zuivel-eieren',

  // Groente & Fruit
  'groente': 'groente-fruit',
  'fruit': 'groente-fruit',
  'appel': 'groente-fruit',
  'banaan': 'groente-fruit',
  'tomaat': 'groente-fruit',

  // Diepvries
  'diepvries': 'diepvries',
  'bevroren': 'diepvries',

  // Dranken
  'drank': 'dranken',
  'sap': 'dranken',
  'koffie': 'dranken',
  'thee': 'dranken',
  'water': 'dranken',
  'cola': 'dranken',
  'bier': 'dranken',
  'wijn': 'dranken',

  // Ontbijt
  'ontbijt': 'ontbijt',
  'granen': 'ontbijt',
  'muesli': 'ontbijt',

  // Snoep & Chips
  'snoep': 'snoep-chips',
  'chips': 'snoep-chips',
  'chocolade': 'snoep-chips',

  // Persoonlijke verzorging
  'shampoo': 'persoonlijke-verzorging',
  'tandpasta': 'persoonlijke-verzorging',
  'zeep': 'persoonlijke-verzorging',

  // Huishouden
  'wasmiddel': 'huishouden',
  'afwasmiddel': 'huishouden',
  'toiletpapier': 'huishouden',
};
