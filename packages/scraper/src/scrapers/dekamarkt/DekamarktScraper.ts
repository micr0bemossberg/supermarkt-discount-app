/**
 * Dekamarkt Scraper
 * Scrapes discount offers from Dekamarkt website
 * Dekamarkt uses Nuxt.js (Vue SSR) with product cards:
 *
 * DOM structure per product card:
 *   .product__card → container
 *   a[href*="/producten/"] → product link + title
 *   .prices .regular → original price (strikethrough)
 *   .chip → deal badge containing price and deal type:
 *     "ACTIE! 1,49" → price 1.49
 *     "500 GRAM 0,99" → price 0.99, unit "500 GRAM"
 *     "2 VOOR 4,49" → price 4.49, unit "2 VOOR"
 *     "6-PACK 3,99" → price 3.99, unit "6-PACK"
 *     "1+1 GRATIS" → price = orig/2, unit "1+1 GRATIS"
 *     "2+1 GRATIS" → price = orig*2/3, unit "2+1 GRATIS"
 *     "25% KORTING" → price = orig*0.75, unit "25% KORTING"
 *   img → product image (hosted on web-fileserver.dekamarkt.nl)
 *
 * JSON-LD: @graph → ItemList → itemListElement (prices but no original_price)
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

interface RawProduct {
  title: string;
  discountPrice: number;
  originalPrice: number | null;
  discountPercentage: number | null;
  unitInfo: string | null;
  imageUrl: string;
  productUrl: string;
}

export class DekamarktScraper extends BaseScraper {
  constructor() {
    super('dekamarkt', 'https://www.dekamarkt.nl/aanbiedingen');
  }

  private detectCategory(title: string): string {
    const lowerTitle = title.toLowerCase();
    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (lowerTitle.includes(keyword)) {
        return category;
      }
    }
    return 'overig';
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Wait for Nuxt.js / Vue to hydrate
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(8000);

      // Scroll to load all products (lazy loading)
      await this.scrollToLoad(page);

      // Build JSON-LD price map for cross-reference
      const jsonLdPriceMap = await this.buildJsonLdPriceMap(page);
      this.logger.info(`JSON-LD has ${jsonLdPriceMap.size} products`);

      // DOM scraping - primary strategy
      const rawProducts = await this.extractProducts(page);
      this.logger.info(`Extracted ${rawProducts.length} products from DOM`);

      if (rawProducts.length === 0) {
        throw new Error('No products found');
      }

      return this.processRawProducts(rawProducts, jsonLdPriceMap);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  /**
   * Build a map of product name → price from JSON-LD data for cross-reference.
   */
  private async buildJsonLdPriceMap(page: any): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    try {
      const jsonLdTexts = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        return Array.from(scripts).map(s => s.textContent).filter(Boolean);
      });

      for (const jsonStr of jsonLdTexts) {
        try {
          const data = JSON.parse(jsonStr!);
          const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

          for (const item of items) {
            if (item['@type'] === 'ItemList' && item.itemListElement) {
              for (const listItem of item.itemListElement) {
                const product = listItem.item || listItem;
                if (product.name && product.offers?.price) {
                  const price = parseFloat(product.offers.price);
                  if (price > 0) {
                    priceMap.set(product.name.toLowerCase(), price);
                  }
                }
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      this.logger.debug('JSON-LD extraction failed:', err);
    }
    return priceMap;
  }

  /**
   * Extract products from DOM using page.evaluate()
   * Prices come from the .chip element, not .prices__offer
   */
  private async extractProducts(page: any): Promise<RawProduct[]> {
    return await page.evaluate(() => {
      const results: any[] = [];
      const cards = document.querySelectorAll('.product__card');

      for (const card of Array.from(cards)) {
        // Title: from product link text
        let title = '';
        const titleLink = card.querySelector('a[href*="/producten/"]');
        if (titleLink) {
          title = titleLink.textContent?.trim() || '';
        }
        // Fallback: image alt text
        if (!title) {
          const img = card.querySelector('img');
          if (img) title = img.getAttribute('alt')?.trim() || '';
        }
        if (!title || title.length < 3) continue;

        // Original price from .prices .regular (strikethrough)
        let originalPrice: number | null = null;
        const regularPriceEl = card.querySelector('.prices .regular');
        if (regularPriceEl) {
          const regText = regularPriceEl.textContent?.trim() || '';
          const match = regText.match(/(\d+)[.,](\d{2})/);
          if (match) {
            originalPrice = parseFloat(`${match[1]}.${match[2]}`);
          }
        }

        // Deal price and unit info from .chip
        // Patterns: "ACTIE! 1,49", "500 GRAM 0,99", "1+1 GRATIS", "25% KORTING",
        //           "2 VOOR 4,49", "6-PACK 3,99", "1.5 KILO 3,49"
        let discountPrice = 0;
        let discountPercentage: number | null = null;
        let unitInfo: string | null = null;

        const chipEl = card.querySelector('.chip');
        if (chipEl) {
          const chipText = chipEl.textContent?.trim() || '';

          // Try to extract price from chip (X,XX pattern)
          const priceMatch = chipText.match(/(\d+)[,](\d{2})\s*$/);
          if (priceMatch) {
            discountPrice = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
            // Extract unit info (everything before the price)
            const beforePrice = chipText.substring(0, chipText.lastIndexOf(priceMatch[0])).trim();
            if (beforePrice && beforePrice !== 'ACTIE!') {
              unitInfo = beforePrice;
            }
          }
          // "1+1 GRATIS" → half original price
          else if (/1\+1\s*GRATIS/i.test(chipText)) {
            if (originalPrice) {
              discountPrice = Math.round((originalPrice / 2) * 100) / 100;
            }
            unitInfo = '1+1 GRATIS';
          }
          // "2+1 GRATIS" → 2/3 original price
          else if (/2\+1\s*GRATIS/i.test(chipText)) {
            if (originalPrice) {
              discountPrice = Math.round((originalPrice * 2 / 3) * 100) / 100;
            }
            unitInfo = '2+1 GRATIS';
          }
          // "XX% KORTING" → percentage off
          else if (/(\d+)\s*%\s*KORTING/i.test(chipText)) {
            const pctMatch = chipText.match(/(\d+)\s*%\s*KORTING/i);
            if (pctMatch && originalPrice) {
              const pct = parseInt(pctMatch[1], 10);
              discountPercentage = pct;
              discountPrice = Math.round(originalPrice * (100 - pct) / 100 * 100) / 100;
            }
            unitInfo = chipText;
          }
        }

        if (discountPrice <= 0) continue;

        // Image URL
        let imageUrl = '';
        const img = card.querySelector('img');
        if (img) {
          imageUrl = img.getAttribute('src') || img.getAttribute('data-src') || '';
        }

        // Product URL
        let productUrl = '';
        if (titleLink) {
          productUrl = titleLink.getAttribute('href') || '';
        }

        results.push({ title, discountPrice, originalPrice, discountPercentage, unitInfo, imageUrl, productUrl });
      }
      return results;
    });
  }

  /**
   * Process raw products: fix URLs, deduplicate, add metadata
   */
  private processRawProducts(rawProducts: RawProduct[], jsonLdPriceMap: Map<string, number>): ScrapedProduct[] {
    const products: ScrapedProduct[] = [];
    const seenTitles = new Map<string, number>();
    const { monday, sunday } = this.getWeekDates();

    for (const raw of rawProducts) {
      // Fix relative image URLs
      let imageUrl = raw.imageUrl;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `https://web-fileserver.dekamarkt.nl${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }

      // Fix relative product URLs
      let productUrl = raw.productUrl;
      if (productUrl && !productUrl.startsWith('http')) {
        productUrl = `https://www.dekamarkt.nl${productUrl}`;
      }

      // If no original price from DOM, check JSON-LD
      let originalPrice = raw.originalPrice ?? undefined;
      if (!originalPrice) {
        const jsonLdPrice = jsonLdPriceMap.get(raw.title.toLowerCase());
        if (jsonLdPrice && jsonLdPrice > raw.discountPrice) {
          originalPrice = jsonLdPrice;
        }
      }

      // Ensure originalPrice > discountPrice
      if (originalPrice && originalPrice <= raw.discountPrice) {
        originalPrice = undefined;
      }

      // Calculate discount percentage if not already set
      let discountPercentage = raw.discountPercentage ?? undefined;
      if (!discountPercentage && originalPrice && originalPrice > raw.discountPrice) {
        discountPercentage = Math.round(((originalPrice - raw.discountPrice) / originalPrice) * 100);
      }

      const normalizedTitle = this.normalizeTitleForDedup(raw.title);
      const existingIndex = seenTitles.get(normalizedTitle);

      const product: ScrapedProduct = {
        title: raw.title,
        discount_price: raw.discountPrice,
        original_price: originalPrice,
        discount_percentage: discountPercentage,
        unit_info: raw.unitInfo || undefined,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(raw.title),
        product_url: productUrl || undefined,
        image_url: imageUrl || undefined,
      };

      if (existingIndex !== undefined) {
        if (raw.discountPrice < products[existingIndex].discount_price) {
          this.logger.debug(`Dedup: replacing ${raw.title} €${products[existingIndex].discount_price} → €${raw.discountPrice}`);
          products[existingIndex] = product;
        }
      } else {
        seenTitles.set(normalizedTitle, products.length);
        products.push(product);
      }

      this.logger.debug(`Scraped: ${raw.title} - €${raw.discountPrice}${originalPrice ? ` (was €${originalPrice})` : ''}${raw.unitInfo ? ` [${raw.unitInfo}]` : ''}`);
    }

    this.logger.success(`Scraped ${products.length} products from Dekamarkt`);
    return products;
  }

  /**
   * Normalize title for dedup: lowercase, collapse whitespace,
   * strip trailing weight/volume, trim punctuation.
   */
  private normalizeTitleForDedup(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*\d+\s*(g|gr|kg|ml|cl|l|liter|stuks?|st)\b/gi, '')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private async scrollToLoad(page: any): Promise<void> {
    this.logger.info('Scrolling to load all products...');
    let previousHeight = 0;
    for (let i = 0; i < 20; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      previousHeight = currentHeight;
    }
  }

  private getWeekDates(): { monday: Date; sunday: Date } {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }
}
