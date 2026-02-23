/**
 * Kruidvat Scraper
 * Scrapes weekly deals from kruidvat.nl/aanbiedingen/dezeweek
 *
 * Kruidvat uses SAP Commerce (Hybris) with aggressive TLS fingerprinting
 * that blocks Chromium. Uses Firefox browser instead.
 *
 * Strategy: Navigate to the deals page, intercept the promotionTiles API
 * response which contains all deal tiles organized by category. Each tile
 * represents a deal (e.g. "1+1 gratis", "50% korting", "2e halve prijs").
 * Then visit the top deal pages to extract individual products with prices.
 */

import { firefox, Page } from 'playwright';
import { BaseScraper } from '../base/BaseScraper';
import { SCRAPER_CONFIG, CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

interface PromoTile {
  code: string;
  title: string;
  localizedURLLink: string;
  image?: { url: string };
  storeOnly?: boolean;
  dayWeekendDeal?: boolean;
  available?: boolean;
}

export class KruidvatScraper extends BaseScraper {
  constructor() {
    super('kruidvat', 'https://www.kruidvat.nl/aanbiedingen/dezeweek');
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
   * Parse deal type from URL slug.
   * E.g. "/a/5203081/loreal-paris-11-gratis" → "1+1 gratis"
   *      "/a/5148381/dove-body-en-mind-50-korting" → "50% korting"
   *      "/a/5191271/maybelline-voor-9-99" → "voor €9,99"
   */
  private parseDealType(url: string): string | null {
    const slug = url.split('/').pop() || '';
    // "11-gratis" → "1+1 gratis"
    if (slug.match(/11-gratis/)) return '1+1 gratis';
    // "2e-halve-prijs" → "2e halve prijs"
    if (slug.match(/2e-halve-prijs/)) return '2e halve prijs';
    // "23-gratis" → "2+3 gratis"
    if (slug.match(/21-gratis/)) return '2+1 gratis';
    if (slug.match(/23-gratis/)) return '2+3 gratis';
    // "50-korting" → "50% korting"
    const kortingMatch = slug.match(/(\d+)-korting/);
    if (kortingMatch) return `${kortingMatch[1]}% korting`;
    // "voor-X-XX" → "voor €X,XX"
    const voorMatch = slug.match(/voor-(\d+)-(\d{2})/);
    if (voorMatch) return `voor €${voorMatch[1]},${voorMatch[2]}`;
    // "2e-voor-1-00" → "2e voor €1,00"
    const tweedeMatch = slug.match(/2e-voor-(\d+)-(\d{2})/);
    if (tweedeMatch) return `2e voor €${tweedeMatch[1]},${tweedeMatch[2]}`;
    return null;
  }

  /**
   * Try to extract a numeric price from the deal URL.
   * E.g. "voor-9-99" → 9.99, "voor-4-49" → 4.49
   */
  private parsePrice(url: string): number {
    const slug = url.split('/').pop() || '';
    const voorMatch = slug.match(/voor-(\d+)-(\d{2})/);
    if (voorMatch) return parseFloat(`${voorMatch[1]}.${voorMatch[2]}`);
    return 0;
  }

  /**
   * Override initBrowser to use Firefox (Kruidvat blocks Chromium via TLS fingerprinting).
   */
  protected async initBrowser(): Promise<Page> {
    this.logger.info('Initializing Firefox browser...');

    this.browser = await firefox.launch({
      headless: SCRAPER_CONFIG.HEADLESS,
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
    const products: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    // Collect promotion tiles from the API
    const promoTiles: PromoTile[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('promotionTiles') && response.status() === 200) {
        try {
          const data = await response.json() as any;
          if (data.tabs) {
            for (const tab of data.tabs) {
              if (tab.categories) {
                for (const cat of tab.categories) {
                  if (cat.promotionTiles) {
                    promoTiles.push(...cat.promotionTiles);
                  }
                }
              }
            }
          }
        } catch {}
      }
    });

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.logger.success('Page loaded');

      await this.handleCookieConsent(page);
      await page.waitForTimeout(5000);

      // Deduplicate tiles by code
      const uniqueTiles = new Map<string, PromoTile>();
      for (const tile of promoTiles) {
        if (!uniqueTiles.has(tile.code)) {
          uniqueTiles.set(tile.code, tile);
        }
      }

      this.logger.info(`Intercepted ${promoTiles.length} tiles, ${uniqueTiles.size} unique`);

      if (uniqueTiles.size === 0) {
        // Fallback: scrape DOM tiles
        this.logger.info('No API tiles intercepted, falling back to DOM scraping...');
        return await this.scrapeDomTiles(page, monday, sunday);
      }

      // Visit ALL deal pages to extract individual products with prices
      const tiles = Array.from(uniqueTiles.values()).filter(t => t.available !== false);
      this.logger.info(`Processing ${tiles.length} available deal tiles...`);

      // Group tiles: ones with individual product pages (/p/) vs deal pages (/a/)
      const productPageTiles = tiles.filter(t => t.localizedURLLink?.includes('/p/'));
      const dealPageTiles = tiles.filter(t => t.localizedURLLink?.includes('/a/'));

      this.logger.info(`  ${productPageTiles.length} individual product tiles, ${dealPageTiles.length} deal page tiles`);

      // Visit top deal pages (limit to 10 to keep runtime reasonable)
      const maxDealPages = 10;
      for (const tile of dealPageTiles.slice(0, maxDealPages)) {
        const url = `https://www.kruidvat.nl${tile.localizedURLLink}`;
        try {
          await this.randomDelay();
          this.logger.info(`Visiting deal: ${tile.title}...`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          const pageProducts = await this.extractProductsFromDealPage(page);
          const dealType = this.parseDealType(tile.localizedURLLink);

          for (const p of pageProducts) {
            products.push({
              title: dealType ? `${p.title} (${dealType})` : p.title,
              discount_price: p.price,
              original_price: p.originalPrice || undefined,
              valid_from: monday,
              valid_until: sunday,
              category_slug: this.detectCategory(p.title),
              product_url: p.url || undefined,
              image_url: p.imageUrl || undefined,
            });
          }

          this.logger.info(`  Got ${pageProducts.length} products from "${tile.title}"`);
        } catch (err) {
          this.logger.warning(`  Failed to scrape deal page: ${tile.title}`);
        }
      }

      // Visit individual product pages (/p/ links) to get real product data (limit to 20)
      const maxProductPages = 20;
      for (const tile of productPageTiles.slice(0, maxProductPages)) {
        const url = `https://www.kruidvat.nl${tile.localizedURLLink}`;
        try {
          await this.randomDelay();
          this.logger.info(`Visiting product: ${tile.title}...`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          const productData = await this.extractSingleProduct(page, url);
          if (productData && productData.price > 0) {
            const dealType = this.parseDealType(tile.localizedURLLink);
            products.push({
              title: dealType ? `${productData.title} (${dealType})` : productData.title,
              discount_price: productData.price,
              original_price: productData.originalPrice || undefined,
              valid_from: monday,
              valid_until: sunday,
              category_slug: this.detectCategory(productData.title),
              product_url: url,
              image_url: productData.imageUrl || undefined,
            });
            this.logger.info(`  Got product: ${productData.title}`);
          }
        } catch (err) {
          this.logger.warning(`  Failed to scrape product page: ${tile.title}`);
        }
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const deduped: ScrapedProduct[] = [];
      for (const p of products) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(p);
      }

      this.logger.success(`Total: ${deduped.length} products from Kruidvat`);
      return deduped;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }

  /**
   * Extract products from a deal page (like /a/{code}/{slug}).
   * These pages have product cards with prices in the tile__product-slide-content structure.
   */
  private async extractProductsFromDealPage(page: Page): Promise<Array<{
    title: string;
    price: number;
    originalPrice: number | null;
    url: string;
    imageUrl: string;
  }>> {
    return await page.evaluate(() => {
      const results: Array<{
        title: string;
        price: number;
        originalPrice: number | null;
        url: string;
        imageUrl: string;
      }> = [];

      // Find product tiles on the deal page
      const tiles = document.querySelectorAll('.tile__product-slide-content');

      for (const tile of Array.from(tiles)) {
        try {
          // Title from product link text
          const linkEl = tile.querySelector('a[href*="/p/"]');
          const title = linkEl?.textContent?.trim() || '';
          if (!title || title.length < 3) continue;

          // Current price from pricebadge
          let price = 0;
          const priceSection = tile.querySelector('.pricebadge');
          if (priceSection) {
            // The current (deal) price
            const currentPriceEl = priceSection.querySelector('.pricebadge__new-price .pricetext, .pricebadge__price .pricetext');
            if (currentPriceEl) {
              const decimal = currentPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
              const fractional = currentPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
              price = parseFloat(`${decimal}.${fractional}`);
            }

            // If no specific new price, try to get any price
            if (price <= 0) {
              const anyPrice = priceSection.querySelector('.pricetext');
              if (anyPrice) {
                const decimal = anyPrice.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
                const fractional = anyPrice.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
                price = parseFloat(`${decimal}.${fractional}`);
              }
            }
          }

          // Fallback: try any price text
          if (price <= 0) {
            const text = tile.textContent || '';
            const priceMatch = text.match(/(\d+)\s*\.\s*(\d{2})/);
            if (priceMatch) price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
          }

          if (price <= 0) continue;

          // Original price
          let originalPrice: number | null = null;
          const oldPriceEl = tile.querySelector('.pricebadge__old-price .pricetext');
          if (oldPriceEl) {
            const decimal = oldPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
            const fractional = oldPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
            originalPrice = parseFloat(`${decimal}.${fractional}`);
          }

          // Image
          const img = tile.querySelector('img[class*="product"], img[data-src*="medias"]');
          const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';

          // Product URL
          const url = (linkEl as HTMLAnchorElement)?.href || '';

          results.push({ title, price, originalPrice, url, imageUrl });
        } catch {}
      }

      // Fallback: product links with prices
      if (results.length === 0) {
        const links = document.querySelectorAll('a[href*="/p/"]');
        for (const link of Array.from(links)) {
          const el = link as HTMLAnchorElement;
          const text = el.textContent?.trim() || '';
          if (!text || text.length < 3) continue;

          // Skip non-product links (reviews, etc.)
          if (el.href.includes('#')) continue;

          const title = text.split('\n').map(l => l.trim()).find(l => l.length > 5 && !l.match(/^\d/) && !l.match(/^van/)) || '';
          if (!title || title.length < 3) continue;

          const priceMatch = text.match(/(\d+)\s*\.\s*(\d{2})/);
          if (!priceMatch) continue;

          results.push({
            title,
            price: parseFloat(`${priceMatch[1]}.${priceMatch[2]}`),
            originalPrice: null,
            url: el.href,
            imageUrl: '',
          });
        }
      }

      return results;
    });
  }

  /**
   * Extract a single product's data from an individual product page (/p/ URL).
   */
  private async extractSingleProduct(page: Page, _url: string): Promise<{
    title: string;
    price: number;
    originalPrice: number | null;
    imageUrl: string;
  } | null> {
    return await page.evaluate(() => {
      // Title from product detail page
      const titleEl = document.querySelector('h1.product-title, h1[class*="product"], .pdp-header__title');
      const title = titleEl?.textContent?.trim() || '';
      if (!title || title.length < 3) return null;

      // Price from pricebadge on product page
      let price = 0;
      const priceBadge = document.querySelector('.pricebadge');
      if (priceBadge) {
        const newPriceEl = priceBadge.querySelector('.pricebadge__new-price .pricetext, .pricebadge__price .pricetext');
        if (newPriceEl) {
          const decimal = newPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
          const fractional = newPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
          price = parseFloat(`${decimal}.${fractional}`);
        }
        if (price <= 0) {
          const anyPrice = priceBadge.querySelector('.pricetext');
          if (anyPrice) {
            const decimal = anyPrice.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
            const fractional = anyPrice.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
            price = parseFloat(`${decimal}.${fractional}`);
          }
        }
      }

      // Original price
      let originalPrice: number | null = null;
      const oldPriceEl = document.querySelector('.pricebadge__old-price .pricetext');
      if (oldPriceEl) {
        const decimal = oldPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
        const fractional = oldPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
        originalPrice = parseFloat(`${decimal}.${fractional}`);
      }

      // Image
      const img = document.querySelector('.product-image img, img[class*="product-detail"]');
      const imageUrl = img?.getAttribute('src') || '';

      return { title, price, originalPrice, imageUrl };
    });
  }

  /**
   * Fallback: scrape promotion tiles directly from the DOM.
   */
  private async scrapeDomTiles(page: Page, monday: Date, sunday: Date): Promise<ScrapedProduct[]> {
    const tiles = await page.evaluate(() => {
      const promoTiles = document.querySelectorAll('.promo-tile');
      return Array.from(promoTiles).map(el => {
        const link = el.closest('a') || el.querySelector('a');
        const img = el.querySelector('img');
        return {
          href: link instanceof HTMLAnchorElement ? link.href : '',
          title: (el.textContent || '').trim(),
          alt: img?.alt || '',
          src: img?.src || img?.getAttribute('data-src') || '',
        };
      });
    });

    this.logger.info(`DOM scraping found ${tiles.length} promo tiles`);

    const seen = new Set<string>();
    const products: ScrapedProduct[] = [];
    for (const tile of tiles) {
      const title = tile.alt || tile.title;
      if (!title || title.length < 3) continue;

      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const dealType = this.parseDealType(tile.href);
      const price = this.parsePrice(tile.href);

      // Skip products without a real price - don't use placeholders
      if (price <= 0) continue;

      const imageUrl = tile.src
        ? (tile.src.startsWith('http') ? tile.src : `https://www.kruidvat.nl${tile.src}`)
        : undefined;

      products.push({
        title: dealType ? `${title} (${dealType})` : title,
        discount_price: price,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(title),
        product_url: tile.href || undefined,
        image_url: imageUrl,
      });
    }

    return products;
  }
}
