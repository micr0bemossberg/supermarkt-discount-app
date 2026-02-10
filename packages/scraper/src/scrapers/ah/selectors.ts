/**
 * Albert Heijn Selectors
 * CSS selectors for scraping Albert Heijn website
 *
 * NOTE: These selectors need to be verified and updated based on
 * the actual AH website structure. Visit https://www.ah.nl/bonus
 * and inspect the HTML to find the correct selectors.
 */

export const ahSelectors = {
  // Product grid/list container (lanes contain product grids)
  productGrid: '[class*="lane_root"], [class*="grid_root"]',

  // Individual product card (promotion cards)
  productCard: '[data-testhook="promotion-card"]',

  // Product title
  title: '[data-testhook="promotion-card-title"]',

  // Product description (subtitle/unit info)
  description: '[data-testhook="card-description"]',

  // Original price (AH doesn't always show original price separately)
  originalPrice: '[data-testhook="original-price"], [class*="was-price"]',

  // Discount label (shows "2e gratis", "25%", "voor 0.99" etc)
  discountPrice: '[data-testhook="promotion-labels"]',

  // Discount percentage badge
  discountBadge: '[data-testhook="promotion-labels"], [class*="promotion-label"]',

  // Product image
  image: '[data-testid="card-image"] img, [class*="promotion-card-image"] img',

  // Product URL/link (the card itself is the link)
  productLink: 'a[href*="/bonus/"]',

  // Unit info (often in description)
  unitInfo: '[data-testhook="card-description"]',

  // Category tags (from lane section header)
  categoryTag: '[class*="area-lane_header"] h3',

  // Load more button
  loadMoreButton: 'button:has-text("Meer laden"), button:has-text("Load more")',

  // Bonus period text
  bonusPeriod: '[data-testhook="bonus-period"], [class*="BonusPeriod"]',
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
