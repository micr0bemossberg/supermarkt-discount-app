/**
 * Albert Heijn Selectors
 * CSS selectors for scraping Albert Heijn website
 *
 * NOTE: These selectors need to be verified and updated based on
 * the actual AH website structure. Visit https://www.ah.nl/bonus
 * and inspect the HTML to find the correct selectors.
 */

export const ahSelectors = {
  // Product grid/list container
  productGrid: '[data-testhook="product-list"], .product-grid, [class*="ProductGrid"]',

  // Individual product card
  productCard: '[data-testhook="product-card"], .product-card, [class*="ProductCard"], article',

  // Product title
  title: '[data-testhook="product-title"], .product-title, h3, [class*="ProductTitle"]',

  // Product description
  description: '[data-testhook="product-description"], .product-description',

  // Original price (before discount)
  originalPrice: '[data-testhook="original-price"], .original-price, .was-price, [class*="OriginalPrice"]',

  // Discount price (current price)
  discountPrice: '[data-testhook="price"], .price, .current-price, [class*="Price"]',

  // Discount percentage badge
  discountBadge: '[data-testhook="discount"], .discount-badge, [class*="Discount"], .badge',

  // Product image
  image: 'img[data-testhook="product-image"], [class*="ProductImage"] img, img',

  // Product URL/link
  productLink: 'a[data-testhook="product-link"], a[href*="/producten/"]',

  // Unit info (e.g., "per kg")
  unitInfo: '[data-testhook="unit-info"], .unit-info, [class*="UnitInfo"]',

  // Category tags
  categoryTag: '[data-testhook="category"], .category',

  // Load more button
  loadMoreButton: 'button:has-text("Meer producten laden"), button:has-text("Load more")',

  // Bonus period text (e.g., "Geldig van 15-01 t/m 21-01")
  bonusPeriod: '[data-testhook="bonus-period"], .bonus-period, [class*="BonusPeriod"]',
};

/**
 * Common patterns for AH product data
 */
export const ahPatterns = {
  // Price format: "1.99" or "€1,99"
  priceRegex: /€?\s*(\d+)[,.](\d{2})/,

  // Discount percentage: "25% korting" or "25%"
  discountRegex: /(\d+)%/,

  // Bonus period: "Geldig van 15-01 t/m 21-01" or "15 t/m 21 januari"
  periodRegex: /(\d{1,2})[^\d]*(\d{1,2})/,
};
