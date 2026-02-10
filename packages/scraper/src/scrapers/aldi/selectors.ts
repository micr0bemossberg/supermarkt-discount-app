/**
 * Aldi Selectors
 * Aldi uses a Next.js app with embedded JSON data.
 * Products are extracted from __NEXT_DATA__ or the page's script tags.
 */

export const aldiSelectors = {
  // Product card (fallback if JSON extraction fails)
  productCard: '[class*="OfferCard"], [class*="product-card"], article',

  // Product title
  title: '[class*="OfferCard"] h3, [class*="product-title"], h3',

  // Price elements
  currentPrice: '[class*="price"], .price',
  originalPrice: '[class*="strike"], .original-price',

  // Product image
  image: '[class*="OfferCard"] img, .product-image img, img',

  // Product link
  productLink: '[class*="OfferCard"] a, a[href*="/aanbiedingen/"]',
};

export const aldiPatterns = {
  priceRegex: /€?\s*(\d+)[,.](\d{2})/,
  discountRegex: /(\d+)%/,
};
