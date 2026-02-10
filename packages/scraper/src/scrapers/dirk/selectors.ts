/**
 * Dirk Selectors
 * CSS selectors for scraping Dirk website (Vue.js based)
 * NOTE: Avoid data-v-* attributes as they change between builds
 */

export const dirkSelectors = {
  // Individual product card
  productCard: 'article',

  // Product title
  title: '.bottom .title, .title',

  // Price elements
  price: '.middle .price, .price',

  // Product image
  image: '.top img, .main-image, article img',

  // Product link
  productLink: '.bottom a, article a',

  // JSON-LD structured data
  jsonLd: 'script[type="application/ld+json"]',
};

export const dirkPatterns = {
  priceRegex: /€?\s*(\d+)[,.](\d{2})/,
};
