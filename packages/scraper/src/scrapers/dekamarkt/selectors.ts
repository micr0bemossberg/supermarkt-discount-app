/**
 * Dekamarkt Selectors
 * CSS selectors for scraping Dekamarkt website (Nuxt.js / Vue SSR)
 * NOTE: Avoid data-v-* attributes as they change between builds
 */

export const dekamarktSelectors = {
  // Individual product card
  productCard: '.product__card',

  // Price elements
  discountPrice: '.prices__offer span',
  originalPrice: '.prices .regular',
  discountChip: '.chip',

  // Product image
  image: '.product__card img',

  // Product link
  productLink: 'a[href*="/producten/"]',

  // JSON-LD structured data
  jsonLd: 'script[type="application/ld+json"]',
};
