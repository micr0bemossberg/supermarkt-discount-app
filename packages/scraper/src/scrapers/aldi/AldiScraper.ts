/**
 * Aldi Scraper
 * Scrapes discount offers from Aldi Netherlands website
 * Aldi uses Next.js with product-tile components for each product.
 *
 * DOM structure:
 * .product-tile
 *   .product-tile__content__upper__brand-name → brand (e.g. "FARMERS FAVOURITE")
 *   .product-tile__content__upper__product-name → product name (e.g. "Aardbeien")
 *   .tag__label--price → deal price (e.g. "2.39")
 *   .tag__cross-price → original price (e.g. "3.49")
 *   .product-tile__image-section__picture img → product image
 *   parent a[href] → product URL
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class AldiScraper extends BaseScraper {
  constructor() {
    super('aldi', 'https://www.aldi.nl/aanbiedingen.html');
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
    const products: ScrapedProduct[] = [];
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Wait for Next.js to hydrate
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(8000);

      // Scroll to load all products (lazy loaded)
      await this.scrollToLoad(page);

      const { monday, sunday } = this.getWeekDates();

      // Extract products from .product-tile elements
      const extractedProducts = await page.evaluate(() => {
        const results: Array<{
          brand: string;
          name: string;
          price: string;
          originalPrice: string;
          discount: string;
          imageUrl: string;
          productUrl: string;
          unitInfo: string;
          promoLabel: string;
        }> = [];

        const tiles = document.querySelectorAll('.product-tile');

        for (const tile of Array.from(tiles)) {
          const brandEl = tile.querySelector('.product-tile__content__upper__brand-name');
          const nameEl = tile.querySelector('.product-tile__content__upper__product-name');
          const priceEl = tile.querySelector('.tag__label--price');
          const crossEl = tile.querySelector('.tag__cross-price');
          const img = tile.querySelector('.product-tile__image-section__picture img, .product-tile__image-section img');
          const link = tile.closest('a') || tile.querySelector('a');
          const unitEl = tile.querySelector('.tag__marker--base-price');

          // Get discount percentage from the price tag text
          const priceTagEl = tile.querySelector('.tag__price');
          const priceTagText = priceTagEl?.textContent?.trim() || '';
          const percentMatch = priceTagText.match(/-?\d+%/);

          // Check for promotional labels like "OP=OP"
          const tileText = tile.textContent || '';
          const hasOpOp = /OP\s*=\s*OP/i.test(tileText);

          const brand = brandEl?.textContent?.trim() || '';
          const name = nameEl?.textContent?.trim() || '';
          const price = priceEl?.textContent?.trim() || '';
          const originalPrice = crossEl?.textContent?.trim() || '';
          const imageUrl = img?.getAttribute('src') || '';
          const productUrl = link?.getAttribute('href') || '';
          const unitInfo = unitEl?.textContent?.trim() || '';
          const discount = percentMatch ? percentMatch[0] : '';
          const promoLabel = hasOpOp ? 'OP=OP' : '';

          if (name) {
            results.push({ brand, name, price, originalPrice, discount, imageUrl, productUrl, unitInfo, promoLabel });
          }
        }

        return results;
      });

      this.logger.info(`Found ${extractedProducts.length} product tiles`);

      const seenTitles = new Set<string>();

      for (const item of extractedProducts) {
        if (!item.name || item.name.length < 2) continue;

        // Build title: "Brand ProductName" or just "ProductName"
        let title = item.name;
        if (item.brand && !item.name.toLowerCase().includes(item.brand.toLowerCase())) {
          title = `${item.brand} ${item.name}`;
        }

        // Append promotional label (e.g., "OP=OP")
        if (item.promoLabel) {
          title = `${title} (${item.promoLabel})`;
        }

        // Deduplicate
        const normalizedTitle = title.toLowerCase();
        if (seenTitles.has(normalizedTitle)) continue;
        seenTitles.add(normalizedTitle);

        // Parse price
        const priceMatch = item.price.match(/(\d+)[.,](\d{2})/);
        if (!priceMatch) continue;
        const price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
        if (price <= 0) continue;

        // Parse original price
        let originalPrice: number | undefined;
        if (item.originalPrice) {
          const origMatch = item.originalPrice.match(/(\d+)[.,](\d{2})/);
          if (origMatch) {
            originalPrice = parseFloat(`${origMatch[1]}.${origMatch[2]}`);
            if (originalPrice <= price) originalPrice = undefined;
          }
        }

        // Parse discount percentage
        let discountPercentage: number | undefined;
        if (item.discount) {
          const discMatch = item.discount.match(/-?(\d+)%/);
          if (discMatch) {
            discountPercentage = parseInt(discMatch[1], 10);
          }
        }

        // Build URLs
        let imageUrl: string | undefined;
        if (item.imageUrl) {
          imageUrl = item.imageUrl.startsWith('http') ? item.imageUrl : `https://www.aldi.nl${item.imageUrl}`;
        }

        let productUrl: string | undefined;
        if (item.productUrl) {
          productUrl = item.productUrl.startsWith('http') ? item.productUrl : `https://www.aldi.nl${item.productUrl}`;
        }

        products.push({
          title,
          discount_price: price,
          original_price: originalPrice,
          discount_percentage: discountPercentage,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(title),
          product_url: productUrl,
          image_url: imageUrl,
          unit_info: item.unitInfo || undefined,
        });
      }

      this.logger.success(`Scraped ${products.length} products from Aldi`);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }

    return products;
  }

  private async scrollToLoad(page: any): Promise<void> {
    this.logger.info('Scrolling to load all products...');
    let previousHeight = 0;
    for (let i = 0; i < 30; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 3) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      previousHeight = currentHeight;
    }
    // Scroll back to top and wait for any lazy elements
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
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
