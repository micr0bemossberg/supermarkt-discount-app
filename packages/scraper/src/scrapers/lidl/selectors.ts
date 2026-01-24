/**
 * Lidl Selectors
 * CSS selectors for scraping Lidl website
 *
 * NOTE: Lidl may use a different structure (PDFs, catalogs) compared to other supermarkets.
 * These selectors need to be verified and updated based on the actual Lidl website.
 */

export const lidlSelectors = {
  // Product grid/list
  productGrid: '.product-grid, .offers-grid, [class*="ProductGrid"]',

  // Individual product card
  productCard: '.product-card, .offer-card, article, [class*="ProductCard"]',

  // Product title
  title: '.product-title, .offer-title, h3, [class*="Title"]',

  // Product description
  description: '.product-description, .offer-description',

  // Price
  discountPrice: '.price, .current-price, [class*="Price"]',

  // Original price
  originalPrice: '.original-price, .was-price, [class*="OriginalPrice"]',

  // Discount badge
  discountBadge: '.discount, .badge, [class*="Discount"]',

  // Product image
  image: '.product-image img, .offer-image img, img',

  // Product link
  productLink: 'a[href*="/product"], a[href*="/offer"]',

  // Unit info
  unitInfo: '.unit-info, .price-per-unit',

  // Catalog/brochure selector (if using PDF catalog)
  catalog: '.catalog, .brochure, [href*=".pdf"]',
};
