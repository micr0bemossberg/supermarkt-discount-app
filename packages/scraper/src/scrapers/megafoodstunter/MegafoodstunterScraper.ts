/**
 * Megafoodstunter Scraper
 * Scrapes discount products from megafoodstunter.nl
 * Elementor/WordPress site - all products displayed on the homepage
 *
 * Product card structure:
 *   .product-card
 *     .badge-korting  → "-44%"
 *     .badge-brand    → "HOMEKO"
 *     a.card-link     → product URL
 *       .product-img-wrap img → image
 *       .product-name  → "Kalfsvleeskroket Halal"
 *       .product-detail → "24 st × 90g"
 *       .price-doos    → "doos €18,95"
 *       .price-stuk    → "€0,79"
 *       .price-label   → "per stuk"
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class MegafoodstunterScraper extends BaseScraper {
  constructor() {
    super('megafoodstunter', 'https://megafoodstunter.nl');
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

      // Scroll to load all products (they're all on the homepage)
      await this.scrollToLoad(page);

      const productCards = await page.$$('.product-card');
      this.logger.info(`Found ${productCards.length} product cards`);

      const products: ScrapedProduct[] = [];
      const { monday, sunday } = this.getWeekDates();

      for (const card of productCards) {
        try {
          // Product name
          const nameEl = await card.$('.product-name');
          const title = nameEl ? (await nameEl.textContent())?.trim() : null;
          if (!title || title.length < 3) continue;

          // Box price (the actual price you pay for the box/doos)
          let discountPrice = 0;
          const priceDoosEl = await card.$('.price-doos');
          if (priceDoosEl) {
            const doosText = (await priceDoosEl.textContent())?.trim() || '';
            const match = doosText.match(/(\d+)[,.](\d{2})/);
            if (match) {
              discountPrice = parseFloat(`${match[1]}.${match[2]}`);
            }
          }
          if (discountPrice <= 0) continue;

          // Discount percentage from badge
          let discountPercentage: number | undefined;
          const badgeEl = await card.$('.badge-korting');
          if (badgeEl) {
            const badgeText = (await badgeEl.textContent())?.trim() || '';
            const match = badgeText.match(/(\d+)/);
            if (match) discountPercentage = parseInt(match[1]);
          }

          // Compute original price from box price + discount percentage
          let originalPrice: number | undefined;
          if (discountPercentage && discountPercentage > 0 && discountPercentage < 100) {
            originalPrice = Math.round((discountPrice / (1 - discountPercentage / 100)) * 100) / 100;
          }

          // Unit/detail info — append per-stuk price if available
          let unitInfo: string | undefined;
          const detailEl = await card.$('.product-detail');
          if (detailEl) {
            unitInfo = (await detailEl.textContent())?.trim() || undefined;
          }
          const priceStukEl = await card.$('.price-stuk');
          if (priceStukEl) {
            const stukText = (await priceStukEl.textContent())?.trim();
            if (stukText) {
              const labelEl = await card.$('.price-label');
              const labelText = labelEl ? (await labelEl.textContent())?.trim() : 'per stuk';
              unitInfo = unitInfo ? `${unitInfo} · ${stukText} ${labelText}` : `${stukText} ${labelText}`;
            }
          }

          // Brand
          const brandEl = await card.$('.badge-brand');
          const brand = brandEl ? (await brandEl.textContent())?.trim() : null;

          // Image
          let imageUrl: string | undefined;
          const img = await card.$('.product-img-wrap img');
          if (img) {
            const src = (await img.getAttribute('src')) || (await img.getAttribute('data-src'));
            if (src && src.startsWith('http')) imageUrl = src;
          }

          // Product URL
          let productUrl: string | undefined;
          const link = await card.$('a.card-link');
          if (link) {
            const href = await link.getAttribute('href');
            if (href) productUrl = href;
          }

          // Build full title with brand
          const fullTitle = brand ? `${brand} ${title}` : title;

          products.push({
            title: fullTitle,
            discount_price: discountPrice,
            original_price: originalPrice,
            discount_percentage: discountPercentage,
            unit_info: unitInfo,
            valid_from: monday,
            valid_until: sunday,
            category_slug: this.detectCategory(fullTitle),
            product_url: productUrl,
            image_url: imageUrl,
          });

          this.logger.debug(`Scraped: ${fullTitle} - €${discountPrice}`);
        } catch (err) {
          this.logger.warning('Failed to parse product card:', err);
        }
      }

      this.logger.success(`Total: ${products.length} products from Megafoodstunter`);
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
      await page.waitForTimeout(1500);
      previousHeight = currentHeight;
    }
  }
}
