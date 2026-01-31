/**
 * Lidl Selectors
 * CSS selectors for scraping Lidl website
 *
 * NOTE: Lidl may use a different structure (PDFs, catalogs) compared to other supermarkets.
 * These selectors need to be verified and updated based on the actual Lidl website.
 */

export const lidlSelectors = {
  // Product grid/list
  productGrid: '[class*="product-grid"], [class*="ProductGrid"], [class*="ATheCampaign"], [class*="grid"]',

  // Individual product card (Lidl uses various tile classes)
  productCard: '.odsc-tile, [class*="odsc-tile"], [class*="product-grid-box"], [class*="ACampaignGrid__item"], [data-gridbox-impression]',

  // Product title (inside the link)
  title: 'a[href*="/p/"], .odsc-tile__link, [class*="product-title"], [class*="title"]',

  // Product description
  description: '[class*="description"], [class*="subtitle"], [class*="keyfacts"]',

  // Price (Lidl shows prices in elements)
  discountPrice: '[class*="pricebox__price"], [class*="price--action"], [class*="lidlplus"], [class*="price"], [class*="Price"]',

  // Original price (strikethrough price)
  originalPrice: '[class*="pricebox__recommended-retail-price"], [class*="strikethrough"], [class*="StrikePrice"], [class*="was-price"], [class*="original"], s, del',

  // Discount badge (percentage off)
  discountBadge: '[class*="pricebox__discount"], [class*="discount"], [class*="badge"], [class*="Label"], [class*="percentage"]',

  // Product image - look for picture elements and img with various attributes
  image: 'picture img, img[srcset], img[data-src], img[src*="lidl"], img[src*="offer"]',

  // Product link
  productLink: 'a[href*="/p/"], a[href*="/aanbiedingen/"]',

  // Unit info (price per kg, etc)
  unitInfo: '[class*="pricebox__basic-quantity"], [class*="unit"], [class*="baseprice"], [class*="per-unit"]',

  // Validity dates
  validityDate: '[class*="ribbon"], [class*="validity"], [class*="available"], [class*="date"]',

  // Data attribute containing product info
  dataAttribute: 'data-gridbox-impression',
};
