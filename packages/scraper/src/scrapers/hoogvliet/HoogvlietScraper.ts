/**
 * Hoogvliet Scraper
 * Scrapes weekly discount offers from hoogvliet.com
 *
 * Hoogvliet uses Intershop Commerce + Tweakwise search.
 * Products rendered via JS. DOM structure per .product-tile:
 *   .promotion-short-title  → "per kuipje  0.99" (promo text, NOT the product name)
 *   img.product-image[alt]  → "Verse slagers rookworst product foto" (product name in alt)
 *   a.product-title          → actual product name link
 *   data-track-click JSON    → { name, category, price, brand }
 *   .strikethrough           → original price range ("1.49 - 2.99")
 *   .non-strikethrough       → discount price (.price-euros + .price-cents)
 *   img.product-image[src]   → relative image path
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class HoogvlietScraper extends BaseScraper {
  constructor() {
    super('hoogvliet', 'https://www.hoogvliet.com/aanbiedingen');
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

  private getWeekDates(): { monday: Date; sunday: Date } {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Wait for Tweakwise to render products
      this.logger.info('Waiting for products to render via Tweakwise...');
      await page.waitForTimeout(5000);

      try {
        await page.waitForSelector('.product-tile', { timeout: 15000 });
      } catch {
        this.logger.warning('Product tile timeout');
      }

      // Scroll to load all products
      await this.scrollToLoad(page);

      // Extract all products from the DOM in one evaluate call
      const rawProducts = await page.evaluate(() => {
        const results: Array<{
          title: string;
          discountPrice: number;
          originalPrice: number | null;
          promoText: string;
          imageUrl: string;
          productUrl: string;
          brand: string;
        }> = [];

        const tiles = document.querySelectorAll('.product-tile');
        for (const tile of Array.from(tiles)) {
          try {
            // 1. Try to get product name from a.product-title
            let title = '';
            const titleLink = tile.querySelector('a.product-title');
            if (titleLink) {
              title = titleLink.textContent?.trim() || '';
            }

            // 2. Fallback: img alt text (strip " product foto")
            if (!title) {
              const img = tile.querySelector('img.product-image');
              if (img) {
                const alt = img.getAttribute('alt') || '';
                title = alt.replace(/\s*product\s*foto\s*$/i, '').trim();
              }
            }

            // 3. Fallback: parse data-track-click JSON
            let brand = '';
            let trackPrice = 0;
            const trackEl = tile.querySelector('[data-track-click]');
            if (trackEl) {
              try {
                const trackData = JSON.parse(trackEl.getAttribute('data-track-click') || '{}');
                const products = trackData.products || [];
                if (products.length > 0) {
                  if (!title) title = products[0].name || '';
                  brand = products[0].brand || '';
                  trackPrice = parseFloat(products[0].price) || 0;
                }
              } catch {}
            }

            if (!title || title.length < 3) continue;

            // 4. Get discount price from .non-strikethrough
            let discountPrice = 0;
            const euroEl = tile.querySelector('.non-strikethrough .price-euros span:first-child');
            const centsEl = tile.querySelector('.non-strikethrough .price-cents sup');
            if (euroEl && centsEl) {
              const euros = euroEl.textContent?.trim() || '0';
              const cents = centsEl.textContent?.trim() || '00';
              discountPrice = parseFloat(`${euros}.${cents}`);
            }

            // Fallback: parse from promotion-short-title text
            if (discountPrice <= 0) {
              const promoEl = tile.querySelector('.promotion-short-title');
              if (promoEl) {
                const promoText = promoEl.textContent?.trim() || '';
                const match = promoText.match(/(\d+)[.](\d{2})\s*$/);
                if (match) {
                  discountPrice = parseFloat(`${match[1]}.${match[2]}`);
                }
              }
            }
            if (discountPrice <= 0) continue;

            // 5. Get original price from .strikethrough or track data
            let originalPrice: number | null = null;
            const strikeEl = tile.querySelector('.strikethrough');
            if (strikeEl) {
              const strikeText = strikeEl.textContent?.trim() || '';
              // Format: "1.49 - 2.99" or just "2.99"
              const prices = strikeText.match(/(\d+[.]\d{2})/g);
              if (prices && prices.length > 0) {
                // Take the last (highest) original price
                originalPrice = parseFloat(prices[prices.length - 1]);
              }
            }
            if (!originalPrice && trackPrice > discountPrice) {
              originalPrice = trackPrice;
            }

            // 6. Get promo text
            const promoEl = tile.querySelector('.promotion-short-title');
            const promoText = promoEl?.textContent?.trim() || '';

            // 7. Get image URL
            let imageUrl = '';
            const img = tile.querySelector('img.product-image');
            if (img) {
              const src = img.getAttribute('data-image-src') || img.getAttribute('src') || '';
              if (src) {
                imageUrl = src.startsWith('http') ? src : `https://www.hoogvliet.com${src}`;
              }
            }

            // 8. Get product URL
            let productUrl = '';
            const linkEl = titleLink || tile.querySelector('.product-image-container a');
            if (linkEl) {
              const href = (linkEl as HTMLAnchorElement).href || linkEl.getAttribute('href') || '';
              productUrl = href.startsWith('http') ? href : `https://www.hoogvliet.com${href}`;
            }

            results.push({
              title,
              discountPrice,
              originalPrice,
              promoText,
              imageUrl,
              productUrl,
              brand,
            });
          } catch {}
        }
        return results;
      });

      this.logger.info(`Extracted ${rawProducts.length} products from Hoogvliet DOM`);

      const { monday, sunday } = this.getWeekDates();
      const products: ScrapedProduct[] = [];
      const seen = new Set<string>();

      for (const p of rawProducts) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        // Build unit_info from promo text (strip the price from the end)
        let unitInfo: string | undefined;
        if (p.promoText) {
          const cleaned = p.promoText.replace(/\s*\d+[.]\d{2}\s*$/, '').trim();
          if (cleaned && cleaned.length > 2) unitInfo = cleaned;
        }

        products.push({
          title: p.title,
          discount_price: p.discountPrice,
          original_price: p.originalPrice || undefined,
          unit_info: unitInfo,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(p.title),
          product_url: p.productUrl || undefined,
          image_url: p.imageUrl || undefined,
        });

        this.logger.debug(`Scraped: ${p.title} - €${p.discountPrice}${p.originalPrice ? ` (was €${p.originalPrice})` : ''}`);
      }

      this.logger.success(`Total: ${products.length} products from Hoogvliet`);
      return products;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
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
}
