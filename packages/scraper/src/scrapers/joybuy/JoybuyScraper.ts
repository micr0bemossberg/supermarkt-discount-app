/**
 * Joybuy Scraper
 * Scrapes discount products from joybuy.nl (JD.com's European marketplace)
 *
 * Joybuy uses JD.com WAF that blocks Chromium via TLS fingerprinting.
 * Uses Firefox browser instead (same approach as Kruidvat).
 *
 * Strategy: Navigate to the Supermarkt mini-homepage which displays
 * product cards with deal prices. Extract products from the DOM using
 * the UK_product_card component structure.
 */

import { firefox, Page } from 'playwright';
import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class JoybuyScraper extends BaseScraper {
  constructor() {
    super('joybuy', 'https://www.joybuy.nl');
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

  /**
   * Override initBrowser to use Firefox (Joybuy/JD.com blocks Chromium via TLS fingerprinting).
   */
  protected async initBrowser(): Promise<Page> {
    this.logger.info('Initializing Firefox browser...');

    this.browser = await firefox.launch({
      headless: true,
    });

    this.context = await this.browser.newContext({
      userAgent: this.getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL',
      timezoneId: 'Europe/Amsterdam',
    });

    this.page = await this.context.newPage();
    this.logger.success('Firefox browser initialized');
    return this.page;
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const page = await this.initBrowser();
    const { monday, sunday } = this.getWeekDates();

    try {
      // Load homepage first to get cookies set up
      this.logger.info('Loading homepage to initialize session...');
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Accept cookies
      await this.acceptJoybuyCookies(page);

      // Navigate to Supermarkt mini-homepage
      const supermarktUrl = `${this.baseUrl}/minihome/Mini-HP-NL-Supermarket`;
      this.logger.info(`Navigating to ${supermarktUrl}...`);
      await page.goto(supermarktUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);

      // Scroll to load all lazy-loaded product cards
      this.logger.info('Scrolling to load all products...');
      await this.scrollToLoad(page);

      // Extract product data from DOM
      const products = await this.extractProducts(page, monday, sunday);
      this.logger.info(`Extracted ${products.length} products from Supermarkt page`);

      // Deduplicate by title
      const seen = new Set<string>();
      const deduped: ScrapedProduct[] = [];
      for (const p of products) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(p);
      }

      this.logger.success(`Total: ${deduped.length} unique products from Joybuy`);
      return deduped;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  /**
   * Accept Joybuy's cookie consent and dismiss popups.
   */
  private async acceptJoybuyCookies(page: Page): Promise<void> {
    const cookieSelectors = [
      'button:has-text("Accepteren")',
      'button:has-text("Alles accepteren")',
      'button:has-text("Accept")',
    ];

    for (const sel of cookieSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          this.logger.info('Accepted cookies');
          await page.waitForTimeout(2000);
          break;
        }
      } catch {}
    }

    // Dismiss "Begrepen" popup (address delivery notice)
    try {
      const dismissBtn = await page.$('button:has-text("Begrepen")');
      if (dismissBtn) {
        await dismissBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
  }

  /**
   * Scroll page to trigger lazy loading of product cards.
   */
  private async scrollToLoad(page: Page): Promise<void> {
    let previousHeight = 0;
    for (let i = 0; i < 20; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 2) break;
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(1000);
      previousHeight = currentHeight;
    }
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
  }

  /**
   * Extract products from the Supermarkt page DOM.
   * Product cards use the UK_product_card component with:
   * - a[href*="/dp/"] for product links
   * - img[alt] for titles and images
   * - [class*="realPrice"] for current/deal price
   * - [class*="originalPrice"] for original/crossed-out price
   */
  private async extractProducts(page: Page, monday: Date, sunday: Date): Promise<ScrapedProduct[]> {
    const rawProducts = await page.evaluate(() => {
      const results: Array<{
        title: string;
        discountPrice: number;
        originalPrice: number | null;
        imageUrl: string;
        productUrl: string;
      }> = [];

      // Find product cards - use class pattern matching since CSS modules hash the names
      const cards = document.querySelectorAll('[class*="UK_product_card"]');

      for (const card of Array.from(cards)) {
        try {
          // Title from img alt or sku name element
          const img = card.querySelector('img');
          const skuNameEl = card.querySelector('[class*="skuName"]');
          const title = skuNameEl?.textContent?.trim() || img?.alt?.trim() || '';
          if (!title || title.length < 3) continue;

          // Product URL
          const link = card.querySelector('a[href*="/dp/"]') as HTMLAnchorElement;
          const productUrl = link?.href || '';

          // Image URL
          const imageUrl = img?.src || img?.getAttribute('data-src') || '';

          // Current/deal price from realPrice element
          let discountPrice = 0;
          const realPriceEl = card.querySelector('[class*="realPrice"]');
          if (realPriceEl) {
            const priceText = realPriceEl.textContent?.trim() || '';
            const match = priceText.match(/€\s*([\d]+[,.][\d]{2})/);
            if (match) {
              discountPrice = parseFloat(match[1].replace(',', '.'));
            }
          }

          // Fallback: find any price in the text
          if (discountPrice <= 0) {
            const text = card.textContent || '';
            const priceMatch = text.match(/€\s*([\d]+[,.][\d]{2})/);
            if (priceMatch) {
              discountPrice = parseFloat(priceMatch[1].replace(',', '.'));
            }
          }

          if (discountPrice <= 0) continue;

          // Original price from originalPrice element (strikethrough)
          let originalPrice: number | null = null;
          const origPriceEl = card.querySelector('[class*="originalPrice"]');
          if (origPriceEl) {
            const origText = origPriceEl.textContent?.trim() || '';
            const origMatch = origText.match(/€\s*([\d]+[,.][\d]{2})/);
            if (origMatch) {
              originalPrice = parseFloat(origMatch[1].replace(',', '.'));
            }
          }

          results.push({ title, discountPrice, originalPrice, imageUrl, productUrl });
        } catch {}
      }

      return results;
    });

    // Convert to ScrapedProduct format
    return rawProducts.map(p => {
      const product: ScrapedProduct = {
        title: p.title,
        discount_price: p.discountPrice,
        original_price: p.originalPrice || undefined,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(p.title),
        product_url: p.productUrl || undefined,
        image_url: p.imageUrl || undefined,
      };

      // Calculate discount percentage
      if (p.originalPrice && p.originalPrice > p.discountPrice) {
        product.discount_percentage = Math.round(
          ((p.originalPrice - p.discountPrice) / p.originalPrice) * 100
        );
      }

      return product;
    });
  }
}
