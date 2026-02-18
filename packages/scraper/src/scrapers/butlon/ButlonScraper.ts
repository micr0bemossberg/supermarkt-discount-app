/**
 * Butlon Scraper
 * Scrapes discount products from butlon.com
 * Craft CMS + Alpine.js + Tailwind site
 *
 * Product tile structure:
 *   .product-tile[data-id]
 *     .product-tile__discount-mobile  → "-80%"
 *     a.product-tile__cover           → href + title + img
 *     .product-tile__price            → "Elders" + line-through price + sale price
 *     .product-tile__title            → product name
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class ButlonScraper extends BaseScraper {
  constructor() {
    super('butlon', 'https://www.butlon.com');
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
      const allProducts: ScrapedProduct[] = [];

      const dealUrls = [
        `${this.baseUrl}/dagknallers`,
        `${this.baseUrl}/laatste-kansje`,
      ];

      for (const url of dealUrls) {
        try {
          const products = await this.scrapePage(page, url);
          allProducts.push(...products);
        } catch (err) {
          this.logger.warning(`Failed to scrape ${url}:`, err);
        }
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const unique = allProducts.filter(p => {
        const key = p.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.logger.success(`Total: ${unique.length} unique products from Butlon`);
      return unique;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  private async scrapePage(page: any, url: string): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    this.logger.info(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    this.logger.success('Page loaded');
    await this.handleCookieConsent(page);
    await page.waitForTimeout(5000);
    await this.scrollToLoad(page);

    // Select top-level product tiles with data-id attribute
    const tiles = await page.$$('.product-tile[data-id]');
    this.logger.info(`Found ${tiles.length} product tiles`);

    for (const tile of tiles) {
      try {
        // Title - from .product-tile__title or from the cover link's title attribute
        let title: string | null = null;
        const titleEl = await tile.$('.product-tile__title');
        if (titleEl) {
          title = (await titleEl.textContent())?.trim() || null;
        }
        if (!title) {
          const coverLink = await tile.$('a.product-tile__cover');
          if (coverLink) {
            title = (await coverLink.getAttribute('title'))?.trim() || null;
            if (title && title.startsWith('Boodschappen - ')) {
              title = title.substring('Boodschappen - '.length);
            }
          }
        }
        if (!title || title.length < 3) continue;

        // Prices from the price area
        let discountPrice = 0;
        let originalPrice: number | undefined;

        const priceArea = await tile.$('.product-tile__price');
        if (priceArea) {
          const priceText = (await priceArea.textContent())?.trim() || '';
          // Extract all number pairs (e.g. "4,99" and "0,99")
          const allPrices = [...priceText.matchAll(/(\d+)[,.](\d{2})/g)];
          if (allPrices.length >= 2) {
            originalPrice = parseFloat(`${allPrices[0][1]}.${allPrices[0][2]}`);
            discountPrice = parseFloat(`${allPrices[1][1]}.${allPrices[1][2]}`);
          } else if (allPrices.length === 1) {
            discountPrice = parseFloat(`${allPrices[0][1]}.${allPrices[0][2]}`);
          }
        }

        // Ensure discount < original
        if (originalPrice && discountPrice > originalPrice) {
          [discountPrice, originalPrice] = [originalPrice, discountPrice];
        }

        if (discountPrice <= 0) continue;

        // Discount percentage from badge
        let discountPercentage: number | undefined;
        const badge = await tile.$('.product-tile__discount-mobile, .product-tile__discount');
        if (badge) {
          const badgeText = (await badge.textContent())?.trim() || '';
          const pctMatch = badgeText.match(/(\d+)/);
          if (pctMatch) discountPercentage = parseInt(pctMatch[1]);
        }
        if (!discountPercentage && originalPrice && originalPrice > discountPrice) {
          discountPercentage = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
        }

        // Image
        let imageUrl: string | undefined;
        const img = await tile.$('.product-tile__thumb img');
        if (img) {
          const src = (await img.getAttribute('src')) || (await img.getAttribute('data-src'));
          if (src && src.startsWith('http')) imageUrl = src;
        }

        // Product URL
        let productUrl: string | undefined;
        const coverLink = await tile.$('a.product-tile__cover');
        if (coverLink) {
          const href = await coverLink.getAttribute('href');
          if (href) productUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        }

        products.push({
          title,
          discount_price: discountPrice,
          original_price: originalPrice,
          discount_percentage: discountPercentage,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(title),
          product_url: productUrl,
          image_url: imageUrl,
        });

        this.logger.debug(`Scraped: ${title} - €${discountPrice}`);
      } catch (err) {
        this.logger.warning('Failed to parse tile:', err);
      }
    }

    this.logger.info(`Page yielded ${products.length} products`);
    return products;
  }

  private async scrollToLoad(page: any): Promise<void> {
    this.logger.info('Scrolling to load all products...');
    let previousHeight = 0;
    for (let i = 0; i < 10; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      previousHeight = currentHeight;
    }
  }
}
