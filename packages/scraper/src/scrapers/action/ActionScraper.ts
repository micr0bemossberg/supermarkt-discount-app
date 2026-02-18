/**
 * Action Scraper
 * Scrapes weekly deal products from action.com/nl-nl/weekactie/
 *
 * Action is a discount retail store (not a supermarket) selling all product types.
 * Next.js 14 with server-side rendering. Products are in a paginated grid.
 * ~158 products across ~7 pages.
 * Images served from Cloudinary CDN: asset.action.com/image/upload/
 * Product URLs: /nl-nl/p/{id}/{slug}/
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class ActionScraper extends BaseScraper {
  constructor() {
    super('action', 'https://www.action.com/nl-nl/weekactie/');
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
    const allProducts: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    try {
      // Scrape page 1 first to find total page count
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);
      await page.waitForTimeout(3000);

      // Determine total pages from pagination
      const totalPages = await this.getTotalPages(page);
      this.logger.info(`Found ${totalPages} pages of products`);

      // Scrape page 1
      const page1Products = await this.extractProductsFromPage(page, monday, sunday);
      allProducts.push(...page1Products);
      this.logger.info(`Page 1: ${page1Products.length} products`);

      // Scrape remaining pages
      for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
        await this.randomDelay();
        const pageUrl = `${this.baseUrl}?page=${pageNum}`;
        this.logger.info(`Navigating to page ${pageNum}...`);

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        const pageProducts = await this.extractProductsFromPage(page, monday, sunday);
        allProducts.push(...pageProducts);
        this.logger.info(`Page ${pageNum}: ${pageProducts.length} products`);
      }

      this.logger.success(`Total: ${allProducts.length} products from Action`);
      return allProducts;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  private async getTotalPages(page: any): Promise<number> {
    try {
      // Look for pagination links or "X results" text
      const paginationText = await page.evaluate(() => {
        // Try to find pagination numbers
        const paginationLinks = document.querySelectorAll('a[href*="page="]');
        let maxPage = 1;
        for (const link of Array.from(paginationLinks)) {
          const href = (link as HTMLAnchorElement).href;
          const match = href.match(/page=(\d+)/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxPage) maxPage = num;
          }
        }

        // Also check for a results count
        const resultsText = document.body.textContent || '';
        const resultsMatch = resultsText.match(/(\d+)\s+(?:resultaten|results|producten|artikelen)/i);
        const totalResults = resultsMatch ? parseInt(resultsMatch[1]) : 0;

        return { maxPage, totalResults };
      });

      if (paginationText.maxPage > 1) {
        return paginationText.maxPage;
      }

      // Estimate from total results (Action shows ~23 per page)
      if (paginationText.totalResults > 0) {
        return Math.ceil(paginationText.totalResults / 23);
      }

      return 7; // Default based on research (~158 products / 23 per page)
    } catch {
      return 7;
    }
  }

  private async extractProductsFromPage(
    page: any,
    monday: Date,
    sunday: Date
  ): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    // Action product links follow pattern: /nl-nl/p/{id}/{slug}/
    const rawProducts = await page.evaluate(() => {
      const results: Array<{
        title: string;
        subtitle: string;
        price: number;
        unitPrice: string;
        imageUrl: string;
        productUrl: string;
      }> = [];

      // Find all product links
      const productLinks = document.querySelectorAll('a[href*="/nl-nl/p/"]');

      for (const link of Array.from(productLinks)) {
        const el = link as HTMLAnchorElement;
        const text = el.textContent?.trim() || '';
        if (!text || text.length < 3) continue;

        // Skip if it's a navigation/breadcrumb link (too short, no price)
        if (!text.match(/\d/)) continue;

        // Extract image
        const img = el.querySelector('img');
        const imageUrl = img?.src || img?.getAttribute('data-src') || '';

        // Skip if no image (likely a navigation link, not a product card)
        if (!imageUrl) continue;

        // Parse text content for title, subtitle, and price
        const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

        // Usually structure is: [badge?, title, subtitle, unit_price, price_integer]
        // Filter out "Weekactie" badge text
        const meaningful = lines.filter((l: string) =>
          l !== 'Weekactie' && l !== 'Nieuw' && !l.match(/^€?\s*\d+$/)
        );

        // Title is usually the first meaningful line
        const title = meaningful[0] || '';
        if (!title || title.length < 2) continue;

        // Subtitle (size/variant) is usually the second meaningful line
        const subtitle = meaningful.length > 1 ? meaningful[1] : '';

        // Find price: look for €X,XX pattern or X,XX pattern
        let price = 0;
        for (const line of lines) {
          const priceMatch = line.match(/€\s*(\d+)[,.](\d{2})/);
          if (priceMatch) {
            price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
            break;
          }
        }

        // Also try matching unit price format like "€ 1,38/l"
        let unitPrice = '';
        for (const line of lines) {
          if (line.match(/€.*\/(?:st|kg|l|m|cm)/i)) {
            unitPrice = line;
            if (price === 0) {
              const match = line.match(/€\s*(\d+)[,.](\d{2})/);
              if (match) price = parseFloat(`${match[1]}.${match[2]}`);
            }
            break;
          }
        }

        // Last resort: try to parse price from integer (Action sometimes shows "138" for €1.38)
        if (price === 0) {
          for (const line of lines) {
            const intMatch = line.match(/^(\d{2,5})$/);
            if (intMatch) {
              const cents = parseInt(intMatch[1]);
              if (cents > 0 && cents < 100000) {
                price = cents / 100;
                break;
              }
            }
          }
        }

        if (price <= 0) continue;

        results.push({
          title,
          subtitle,
          price,
          unitPrice,
          imageUrl: imageUrl.startsWith('http') ? imageUrl : `https://www.action.com${imageUrl}`,
          productUrl: el.href,
        });
      }

      return results;
    });

    // Deduplicate by product URL
    const seen = new Set<string>();
    for (const p of rawProducts) {
      if (seen.has(p.productUrl)) continue;
      seen.add(p.productUrl);

      const unitInfo = p.subtitle || p.unitPrice || undefined;

      products.push({
        title: p.title,
        discount_price: p.price,
        unit_info: unitInfo,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(p.title),
        product_url: p.productUrl,
        image_url: p.imageUrl || undefined,
      });

      this.logger.debug(`Scraped: ${p.title} - €${p.price}`);
    }

    return products;
  }
}
