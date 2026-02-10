/**
 * Jumbo Scraper
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class JumboScraper extends BaseScraper {
  constructor() {
    super('jumbo', 'https://www.jumbo.com/aanbiedingen');
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
      await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 90000 });

      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Wait for dynamic content
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(10000);

      // Find article elements
      const articles = await page.$$('article[class*="jum-card"]');
      this.logger.success(`Found ${articles.length} product cards`);

      if (articles.length === 0) {
        throw new Error('No products found');
      }

      // Calculate validity dates (Monday to Sunday)
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      // Extract products
      for (let i = 0; i < articles.length; i++) {
        try {
          const article = articles[i];

          // Get text content
          const allText = await article.textContent();
          const text = allText?.trim() || '';

          // Find link and extract URL
          const link = await article.$('a');
          let productUrl = undefined;
          let title = `Jumbo Aanbieding ${i + 1}`;

          if (link) {
            const href = await link.getAttribute('href');
            if (href) {
              productUrl = href.startsWith('http') ? href : `https://www.jumbo.com${href}`;

              // Try to get better title from link text
              const linkText = await link.textContent();
              if (linkText && linkText.trim() && linkText.trim().length > 5) {
                const lines = linkText.trim().split('\n').filter(l => l.trim());
                title = lines[0] || title;
              }
            }
          }

          // Find image
          const img = await article.$('img');
          let imageUrl = undefined;
          if (img) {
            const src = await img.getAttribute('src');
            if (src) {
              imageUrl = src.startsWith('http') ? src : `https://www.jumbo.com${src}`;
            }
          }

          // Try to extract price from text
          let price = 1.99; // default
          const priceMatch = text.match(/€?\s*([0-9]+[,\.][0-9]{2})/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(',', '.'));
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

      this.logger.success(`Scraped ${products.length} products from Jumbo`);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }

    return products;
  }
}
