/**
 * Vomar Selectors
 * CSS selectors for scraping Vomar website
 */

export const vomarSelectors = {
  // Product container
  productContainer: '#products',

  // Individual product card
  productCard: '.product',

  // Product title/description
  title: '.product a .content .description, .product a .content h3, .product a .content h4',

  // Price elements
  price: '.price',
  priceLarge: '.price .large',
  priceSmall: '.price .small',
  discountPrice: '.price.discount',

  // Product image
  image: '.product a .image img',

  // Product link
  productLink: '.product a',
};

export const vomarPatterns = {
  priceRegex: /€?\s*(\d+)[,.](\d{2})/,
};
