/**
 * Dirk Scraper
 * Scrapes discount offers from Dirk van den Broek website
 * Dirk uses Vue.js - avoid data-v-* attributes as they change between builds
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

      // Strategy 1: Try JSON-LD structured data first
      const jsonLdProducts = await this.extractFromJsonLd(page);
      if (jsonLdProducts.length > 0) {
        this.logger.success(`Extracted ${jsonLdProducts.length} products from JSON-LD`);
        return jsonLdProducts;
      }

      // Strategy 2: DOM scraping
      this.logger.info('JSON-LD extraction failed, using DOM scraping...');
      await this.scrollToLoad(page);

      const articles = await page.$$(selectors.productCard);
      this.logger.info(`Found ${articles.length} article elements`);

      if (articles.length === 0) {
        // Try broader selectors
        const altCards = await page.$$('[class*="product"], [class*="offer"], .card');
        this.logger.info(`Fallback found ${altCards.length} cards`);
        if (altCards.length === 0) throw new Error('No products found');
        return this.parseArticles(altCards);
      }

      return this.parseArticles(articles);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  private async extractFromJsonLd(page: any): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    try {
      const jsonLdTexts = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        return Array.from(scripts).map(s => s.textContent).filter(Boolean);
      });

      const { monday, sunday } = this.getWeekDates();

      for (const jsonStr of jsonLdTexts) {
        try {
          const data = JSON.parse(jsonStr!);
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            // Handle ItemList with itemListElement
            if (item['@type'] === 'ItemList' && item.itemListElement) {
              for (const listItem of item.itemListElement) {
                const product = listItem.item || listItem;
                const parsed = this.parseJsonLdProduct(product, monday, sunday);
                if (parsed) products.push(parsed);
              }
            }
            // Handle direct Product entries
            else if (item['@type'] === 'Product') {
              const parsed = this.parseJsonLdProduct(item, monday, sunday);
              if (parsed) products.push(parsed);
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    } catch (err) {
      this.logger.debug('JSON-LD extraction failed:', err);
    }
    return products;
  }

  private parseJsonLdProduct(item: any, monday: Date, sunday: Date): ScrapedProduct | null {
    const title = item.name;
    if (!title) return null;

    let price = 0;
    if (item.offers?.price) {
      price = parseFloat(item.offers.price);
    } else if (item.offers?.lowPrice) {
      price = parseFloat(item.offers.lowPrice);
    }
    if (price <= 0) return null;

    return {
      title,
      discount_price: price,
      valid_from: monday,
      valid_until: sunday,
      category_slug: this.detectCategory(title),
      product_url: item.url || item.offers?.url,
      image_url: Array.isArray(item.image) ? item.image[0] : item.image,
    };
  }

  private async parseArticles(articles: any[]): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    for (let i = 0; i < articles.length; i++) {
      try {
        const article = articles[i];
        const text = (await article.textContent())?.trim() || '';
        if (!text || text.length < 3) continue;

        // Extract title
        let title: string | null = null;
        const titleEl = await article.$('.title, h3, h4, [class*="title"], [class*="name"]');
        if (titleEl) {
          title = (await titleEl.textContent())?.trim() || null;
        }
        if (!title) {
          const bottomEl = await article.$('.bottom a, a');
          if (bottomEl) {
            const linkText = (await bottomEl.textContent())?.trim();
            if (linkText && linkText.length > 3) {
              // First meaningful line
              const lines = linkText.split('\n').filter((l: string) => l.trim());
              title = lines[0]?.trim();
            }
          }
        }
        if (!title || title.length < 3) continue;

        // Extract price
        let price = 0;
        const priceEl = await article.$('.price, [class*="price"]');
        if (priceEl) {
          const priceText = (await priceEl.textContent())?.trim() || '';
          const priceMatch = priceText.match(/(\d+)[,.](\d{2})/);
          if (priceMatch) {
            price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
          }
        }
        if (price <= 0) {
          const priceMatch = text.match(/€?\s*(\d+)[,.](\d{2})/);
          if (priceMatch) {
            price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
          }
        }
        if (price <= 0) continue;

        // Extract image
        const img = await article.$('img');
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

        products.push({
          title,
          discount_price: price,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(title),
          product_url: productUrl,
          image_url: imageUrl,
        });

        this.logger.debug(`Scraped: ${title} - €${price}`);
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
