/**
 * Flink Scraper
 * Scrapes deal products from goflink.com web shop
 *
 * Flink is an online-only grocery delivery service (dark stores).
 * Angular web app with aggressive bot protection (403).
 * Requires Playwright with stealth. The shop page may require
 * entering a delivery address before showing products.
 * Deals section includes "Budget Picks", "Bundle Bargains", daily deals.
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class FlinkScraper extends BaseScraper {
  constructor() {
    super('flink', 'https://www.goflink.com/shop/nl-NL/');
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
    const products: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    try {
      // Try the deals page directly
      const dealsUrl = 'https://www.goflink.com/shop/nl-NL/category/deals';
      this.logger.info(`Navigating to ${dealsUrl}...`);

      await page.goto(dealsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.logger.success('Page loaded');

      // Check if we got a 403 or need to enter an address
      const pageTitle = await page.title();
      const pageUrl = page.url();
      this.logger.info(`Page title: "${pageTitle}", URL: ${pageUrl}`);

      await this.handleCookieConsent(page);
      await page.waitForTimeout(5000);

      // Check if there's an address input (Flink requires this)
      const addressInput = await page.$('input[placeholder*="address"], input[placeholder*="adres"], input[type="text"][aria-label*="address"], input[name*="address"]');
      if (addressInput) {
        this.logger.info('Address input found, entering Amsterdam address...');
        await addressInput.fill('Damrak 1, Amsterdam');
        await page.waitForTimeout(2000);

        // Try clicking a suggestion
        const suggestion = await page.$('[class*="suggestion"], [class*="autocomplete"] li, [role="option"]');
        if (suggestion) {
          await suggestion.click();
          await page.waitForTimeout(3000);
        } else {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(3000);
        }
      }

      // Navigate to deals section if not already there
      if (!page.url().includes('deal')) {
        const dealsLink = await page.$('a[href*="deal"], a:has-text("Deals"), a:has-text("Aanbiedingen")');
        if (dealsLink) {
          await dealsLink.click();
          await page.waitForTimeout(3000);
        }
      }

      // Scroll to load products
      await this.scrollToLoad(page);

      // Extract products
      const rawProducts = await page.evaluate(() => {
        const results: Array<{
          title: string;
          price: number;
          originalPrice: number | null;
          imageUrl: string;
          productUrl: string;
        }> = [];

        // Look for product cards — Flink uses Angular, try various selectors
        const selectors = [
          '[class*="product-card"]',
          '[class*="ProductCard"]',
          '[class*="product-tile"]',
          '[class*="item-card"]',
          'article[class*="product"]',
          '[data-testid*="product"]',
        ];

        let cards: Element[] = [];
        for (const sel of selectors) {
          const found = document.querySelectorAll(sel);
          if (found.length > 0) {
            cards = Array.from(found);
            break;
          }
        }

        // Fallback: find elements with images and prices
        if (cards.length === 0) {
          const allLinks = document.querySelectorAll('a');
          for (const link of Array.from(allLinks)) {
            const el = link as HTMLAnchorElement;
            const img = el.querySelector('img');
            if (!img) continue;

            const text = el.textContent?.trim() || '';
            const priceMatch = text.match(/€\s*(\d+)[,.](\d{2})/);
            if (!priceMatch) continue;

            const title = img.alt?.trim() || text.split('\n').map(l => l.trim()).find(l => l.length > 3 && !l.match(/^€/)) || '';
            if (!title || title.length < 3) continue;

            results.push({
              title,
              price: parseFloat(`${priceMatch[1]}.${priceMatch[2]}`),
              originalPrice: null,
              imageUrl: img.src || '',
              productUrl: el.href,
            });
          }
        }

        for (const card of cards) {
          try {
            const titleEl = card.querySelector('[class*="title"], [class*="name"], h3, h4, p');
            const title = titleEl?.textContent?.trim() || '';
            if (!title || title.length < 3) continue;

            let price = 0;
            const priceEls = card.querySelectorAll('[class*="price"]');
            for (const pe of Array.from(priceEls)) {
              const m = pe.textContent?.match(/(\d+)[,.](\d{2})/);
              if (m) {
                const p = parseFloat(`${m[1]}.${m[2]}`);
                if (price === 0) price = p;
              }
            }
            if (price <= 0) continue;

            // Check for strikethrough price
            let originalPrice: number | null = null;
            const strikeEl = card.querySelector('[class*="strike"], [class*="was"], [class*="old"], del, s');
            if (strikeEl) {
              const m = strikeEl.textContent?.match(/(\d+)[,.](\d{2})/);
              if (m) originalPrice = parseFloat(`${m[1]}.${m[2]}`);
            }

            const img = card.querySelector('img');
            const imageUrl = img?.src || '';

            const link = card.querySelector('a');
            const productUrl = (link as HTMLAnchorElement)?.href || '';

            results.push({ title, price, originalPrice, imageUrl, productUrl });
          } catch {}
        }

        return results;
      });

      this.logger.info(`Extracted ${rawProducts.length} products from Flink`);

      const seen = new Set<string>();
      for (const p of rawProducts) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        products.push({
          title: p.title,
          discount_price: p.price,
          original_price: p.originalPrice || undefined,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(p.title),
          product_url: p.productUrl || undefined,
          image_url: p.imageUrl || undefined,
        });
      }

      this.logger.success(`Total: ${products.length} products from Flink`);
      return products;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  private async scrollToLoad(page: any): Promise<void> {
    this.logger.info('Scrolling to load products...');
    let previousHeight = 0;
    for (let i = 0; i < 15; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight && i > 0) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      previousHeight = currentHeight;
    }
  }
}
