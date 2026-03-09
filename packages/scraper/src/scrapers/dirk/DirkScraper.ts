/**
 * Dirk Scraper
 * Scrapes discount offers from Dirk van den Broek website
 * Dirk uses Vue.js with a specific price structure:
 *
 * DOM structure per article:
 *   .title → product name
 *   .regular-price → "van X.XX" (original price)
 *   .hasEuros.price-large → euros part of deal price (e.g. "1")
 *   .price-small → cents part of deal price (e.g. "98")
 *   When price < €1: .price-large (without .hasEuros) → cents only (e.g. "99")
 *   .main-image → product image
 *   a[href] → product link
 *
 * JSON-LD: @graph → ItemList → itemListElement (37 items, correct prices but no original_price)
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import { dirkSelectors as selectors } from './selectors';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class DirkScraper extends BaseScraper {
  constructor() {
    super('dirk', 'https://www.dirk.nl/aanbiedingen');
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

      // Wait for Vue.js to render
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(8000);

      // Scroll to load all products
      await this.scrollToLoad(page);

      // Build JSON-LD price map for cross-reference
      const jsonLdPriceMap = await this.buildJsonLdPriceMap(page);
      this.logger.info(`JSON-LD has ${jsonLdPriceMap.size} products`);

      // DOM scraping - primary strategy
      const articles = await page.$$(selectors.productCard);
      this.logger.info(`Found ${articles.length} article elements`);

      if (articles.length === 0) {
        throw new Error('No products found');
      }

      return this.parseArticles(articles, jsonLdPriceMap);
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

          // Handle @graph wrapper
          const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

          for (const item of items) {
            if (item['@type'] === 'ItemList' && item.itemListElement) {
              for (const listItem of item.itemListElement) {
                const product = listItem.item || listItem;
                if (product.name && product.offers?.price) {
                  priceMap.set(product.name.toLowerCase(), parseFloat(product.offers.price));
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
   * Normalize title for dedup comparison: lowercase, collapse whitespace,
   * strip trailing weight/volume (e.g. "360g", "1.5L"), trim punctuation.
   */
  private normalizeTitleForDedup(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s+/g, ' ')           // collapse whitespace
      .replace(/\s*\d+\s*(g|gr|kg|ml|cl|l|liter|stuks?|st)\b/gi, '') // strip weight/volume
      .replace(/[^\w\s]/g, '')         // strip punctuation
      .trim();
  }

  private async parseArticles(articles: any[], jsonLdPriceMap: Map<string, number>): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const seenTitles = new Map<string, number>(); // normalized title → index in products array (keep lowest price)
    const { monday, sunday } = this.getWeekDates();

    for (let i = 0; i < articles.length; i++) {
      try {
        const article = articles[i];

        // Extract title
        const titleEl = await article.$('.title, h3, h4, [class*="title"]');
        let title = titleEl ? (await titleEl.textContent())?.trim() || '' : '';
        if (!title || title.length < 3) continue;

        // Extract deal price using Dirk's specific price structure
        let price = 0;
        let originalPrice: number | undefined;

        // Strategy 1 (PRIMARY): DOM price extraction — the deal/Actie price
        // .price-large.hasEuros = euros, .price-small = cents
        const priceLargeEl = await article.$('.price-large');
        const priceSmallEl = await article.$('.price-small');

        if (priceLargeEl) {
          const priceLargeText = (await priceLargeEl.textContent())?.trim() || '';
          const hasEuros = await priceLargeEl.evaluate((el: Element) => el.classList.contains('hasEuros'));

          if (hasEuros && priceSmallEl) {
            // Price >= €1: euros.cents
            const priceSmallText = (await priceSmallEl.textContent())?.trim() || '';
            price = parseFloat(`${priceLargeText}.${priceSmallText}`);
          } else if (priceLargeText && /^\d+$/.test(priceLargeText)) {
            // Price < €1: just cents
            price = parseFloat(`0.${priceLargeText}`);
          }
        }

        // Strategy 2: Fallback regex from full text
        if (price <= 0) {
          const fullText = (await article.textContent())?.trim() || '';
          const priceMatch = fullText.match(/van\s+\d+[.,]\d{2}\s*(\d{1,4})/);
          if (priceMatch) {
            const rawNum = priceMatch[1];
            if (rawNum.length <= 2) {
              price = parseFloat(`0.${rawNum.padStart(2, '0')}`);
            } else if (rawNum.length === 3) {
              price = parseFloat(`${rawNum[0]}.${rawNum.slice(1)}`);
            } else if (rawNum.length === 4) {
              price = parseFloat(`${rawNum.slice(0, 2)}.${rawNum.slice(2)}`);
            }
          }
        }

        // Strategy 3: JSON-LD as last resort (may contain original prices)
        if (price <= 0) {
          const jsonLdPrice = jsonLdPriceMap.get(title.toLowerCase());
          if (jsonLdPrice && jsonLdPrice > 0) {
            price = jsonLdPrice;
          }
        }

        if (price <= 0) continue;

        // Extract original price from .regular-price "van X.XX"
        const regularPriceEl = await article.$('.regular-price');
        if (regularPriceEl) {
          const regularText = (await regularPriceEl.textContent())?.trim() || '';
          const origMatch = regularText.match(/(\d+)[.,](\d{2})/);
          if (origMatch) {
            originalPrice = parseFloat(`${origMatch[1]}.${origMatch[2]}`);
            if (originalPrice <= price) originalPrice = undefined;
          }
        }

        // If no original_price from DOM, check JSON-LD (it often has the catalog price)
        if (!originalPrice) {
          const jsonLdPrice = jsonLdPriceMap.get(title.toLowerCase());
          if (jsonLdPrice && jsonLdPrice > price) {
            originalPrice = jsonLdPrice;
          }
        }

        // Extract image
        const img = await article.$('img.main-image, img');
        let imageUrl: string | undefined;
        if (img) {
          const src = (await img.getAttribute('src')) || (await img.getAttribute('data-src'));
          if (src) {
            imageUrl = src.startsWith('http') ? src : `https://www.dirk.nl${src}`;
          }
        }

        // Extract link
        let productUrl: string | undefined;
        const link = await article.$('a');
        if (link) {
          const href = await link.getAttribute('href');
          if (href) {
            productUrl = href.startsWith('http') ? href : `https://www.dirk.nl${href}`;
          }
        }

        const normalizedTitle = this.normalizeTitleForDedup(title);
        const existingIndex = seenTitles.get(normalizedTitle);

        const product: ScrapedProduct = {
          title,
          discount_price: price,
          original_price: originalPrice,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(title),
          product_url: productUrl,
          image_url: imageUrl,
        };

        if (existingIndex !== undefined) {
          // Duplicate title: keep the one with the lower deal price
          if (price < products[existingIndex].discount_price) {
            this.logger.debug(`Dedup: replacing ${title} €${products[existingIndex].discount_price} → €${price}`);
            products[existingIndex] = product;
          } else {
            this.logger.debug(`Dedup: skipping ${title} €${price} (keeping €${products[existingIndex].discount_price})`);
          }
        } else {
          seenTitles.set(normalizedTitle, products.length);
          products.push(product);
        }

        this.logger.debug(`Scraped: ${title} - €${price}${originalPrice ? ` (was €${originalPrice})` : ''}`);
      } catch (err) {
        this.logger.warning(`Failed to parse article ${i}:`, err);
      }
    }

    this.logger.success(`Scraped ${products.length} products from Dirk`);
    return products;
  }

  private async scrollToLoad(page: any): Promise<void> {
    this.logger.info('Scrolling to load all products...');
    let previousHeight = 0;
    for (let i = 0; i < 15; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
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
