/**
 * Jumbo Selectors
 * CSS selectors for scraping Jumbo website
 *
 * NOTE: These selectors need to be verified and updated based on
 * the actual Jumbo website structure. Visit https://www.jumbo.com/aanbiedingen
 * and inspect the HTML to find the correct selectors.
 */

export const jumboSelectors = {
  // Product grid/list container
  productGrid: '[data-testid="product-list"], .product-grid, .products-list',

  // Individual product card
  productCard: '[data-testid="product-card"], .product-card, .product-item',

  // Product title
  title: '[data-testid="product-title"], .product-title, h3, .title',

  // Product description
  description: '[data-testid="product-description"], .product-description, .description',

  // Original price (before discount)
  originalPrice: '[data-testid="original-price"], .original-price, .was-price, .old-price',

  // Discount price (current price)
  discountPrice: '[data-testid="price"], .price, .current-price, .sale-price',

  // Discount percentage badge
  discountBadge: '[data-testid="discount-badge"], .discount-badge, .percentage, .badge',

  // Product image
  image: 'img[data-testid="product-image"], .product-image img, img',

  // Product URL/link
  productLink: 'a[data-testid="product-link"], .product-link, a',

  // Unit info (e.g., "per kg")
  unitInfo: '[data-testid="unit-info"], .unit-info, .price-per-unit',

  // Validity period
  validFrom: '[data-testid="valid-from"], .valid-from',
  validUntil: '[data-testid="valid-until"], .valid-until, .validity',

  // Pagination/load more
  loadMoreButton: 'button:has-text("Meer laden"), button:has-text("Load more"), .load-more',
  nextPageButton: '[data-testid="next-page"], .next-page, a:has-text("Volgende")',

  // Category tags
  categoryTag: '[data-testid="category"], .category, .product-category',
};

/**
 * Common patterns for Jumbo product URLs
 */
export const jumboPatterns = {
  // Typical Jumbo price format: "€1,99" or "1.99"
  priceRegex: /€?\s*(\d+)[,.](\d{2})/,

  // Discount percentage: "25%" or "25% korting"
  discountRegex: /(\d+)%/,

  // Product ID in URL
  productIdRegex: /\/(\d+)\//,
};
