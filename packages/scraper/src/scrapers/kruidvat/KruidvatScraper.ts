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
import { isNonGroceryProduct, isAlcoholProduct } from '../../database/products';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

interface PromoTile {
  code: string;
  title: string;
  localizedURLLink: string;
  image?: { url: string };
  storeOnly?: boolean;
  dayWeekendDeal?: boolean;
  available?: boolean;
  dealCategory?: string; // deal type from API category (e.g. "1+1 gratis", "50% korting")
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

  private normalizeImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `https://www.kruidvat.nl${url}`;
    return undefined;
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
   * Extract deal type from tile title text as fallback when URL parsing fails.
   * E.g. "Kruidvat vitaminen 1+1 gratis" → "1+1 gratis"
   *      "AH Pasta 2e halve prijs" → "2e halve prijs"
   */
  private parseDealTypeFromTitle(title: string): string | null {
    const lower = title.toLowerCase();
    // "1+1 gratis"
    if (lower.includes('1+1 gratis') || lower.includes('1 + 1 gratis')) return '1+1 gratis';
    // "2+1 gratis", "2+3 gratis", etc.
    const plusGratis = lower.match(/(\d)\s*\+\s*(\d)\s*gratis/);
    if (plusGratis) return `${plusGratis[1]}+${plusGratis[2]} gratis`;
    // "2e halve prijs"
    if (lower.includes('2e halve prijs')) return '2e halve prijs';
    // "2e gratis"
    if (lower.includes('2e gratis')) return '2e gratis';
    // "3e gratis"
    if (lower.includes('3e gratis')) return '3e gratis';
    // "XX% korting"
    const kortingMatch = lower.match(/(\d+)\s*%\s*korting/);
    if (kortingMatch) return `${kortingMatch[1]}% korting`;
    // "voor €X,XX" or "voor X.XX"
    const voorMatch = lower.match(/voor\s*€?\s*(\d+)[,.](\d{2})/);
    if (voorMatch) return `voor €${voorMatch[1]},${voorMatch[2]}`;
    // "2e voor €X,XX"
    const tweedeVoor = lower.match(/2e\s+voor\s*€?\s*(\d+)[,.](\d{2})/);
    if (tweedeVoor) return `2e voor €${tweedeVoor[1]},${tweedeVoor[2]}`;
    // "alle ... X.XX" or "alle ... €X,XX"
    const alleMatch = lower.match(/alle\s+.*?(\d+)[,.](\d{2})/);
    if (alleMatch) return `alle voor €${alleMatch[1]},${alleMatch[2]}`;
    // Generic "gratis" mention
    if (lower.includes('gratis')) return 'gratis';
    // "actie" or "actieprijs"
    if (lower.includes('actieprijs')) return 'actieprijs';
    // "sale" or "deal"
    if (lower.includes('sale') || lower.includes('deal')) return 'aanbieding';
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
                    // Preserve the deal category name (e.g. "1+1 gratis", "2e halve prijs")
                    const dealCategory = cat.title || cat.name || '';
                    for (const tile of cat.promotionTiles) {
                      promoTiles.push({ ...tile, dealCategory });
                    }
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

      // Filter out non-grocery tiles before visiting their pages (saves time)
      const allTiles = Array.from(uniqueTiles.values()).filter(t => t.available !== false);
      const tiles = allTiles.filter(t => {
        if (isNonGroceryProduct(t.title) || isAlcoholProduct(t.title)) {
          this.logger.debug(`Skipped non-grocery tile: ${t.title}`);
          return false;
        }
        return true;
      });
      this.logger.info(`Processing ${tiles.length} grocery deal tiles (filtered ${allTiles.length - tiles.length} non-grocery)...`);

      // Group tiles: ones with individual product pages (/p/) vs deal pages (/a/)
      const productPageTiles = tiles.filter(t => t.localizedURLLink?.includes('/p/'));
      const dealPageTiles = tiles.filter(t => t.localizedURLLink?.includes('/a/'));

      this.logger.info(`  ${productPageTiles.length} individual product tiles, ${dealPageTiles.length} deal page tiles`);

      // Log deal categories found
      const dealCategories = new Map<string, number>();
      for (const t of tiles) {
        const cat = t.dealCategory || 'unknown';
        dealCategories.set(cat, (dealCategories.get(cat) || 0) + 1);
      }
      for (const [cat, count] of dealCategories) {
        this.logger.info(`  Deal category: "${cat}" (${count} tiles)`);
      }

      // Visit deal pages (cap at 100 to keep runtime reasonable ~10min)
      const maxDealPages = Math.min(dealPageTiles.length, 100);
      for (const tile of dealPageTiles.slice(0, maxDealPages)) {
        const url = `https://www.kruidvat.nl${tile.localizedURLLink}`;
        try {
          await this.randomDelay();
          this.logger.info(`Visiting deal: ${tile.title}...`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          const result = await this.extractProductsFromDealPage(page);

          // Skip expired deals
          if (result.expired) {
            this.logger.info(`  Skipping expired deal: ${tile.title}`);
            continue;
          }

          // Deal type priority: page <h1> > URL slug > tile title
          const dealType = result.pageDealType
            || this.parseDealType(tile.localizedURLLink)
            || this.parseDealTypeFromTitle(tile.title);

          // Card requirement: from page h1 or API deal category
          const isCardDeal = result.requiresCard || tile.dealCategory?.toLowerCase().includes('kaart') || false;

          for (const p of result.products) {
            // Skip products with no deal indication: no deal type AND no original price
            if (!dealType && !p.originalPrice) {
              continue;
            }
            // Skip non-grocery products extracted from deal pages
            if (isNonGroceryProduct(p.title) || isAlcoholProduct(p.title)) {
              continue;
            }
            products.push({
              title: dealType ? `${p.title} (${dealType})` : p.title,
              discount_price: p.price,
              original_price: p.originalPrice || undefined,
              valid_from: monday,
              valid_until: sunday,
              category_slug: this.detectCategory(p.title),
              product_url: p.url || undefined,
              image_url: this.normalizeImageUrl(p.imageUrl),
              requires_card: isCardDeal,
            });
          }

          this.logger.info(`  Got ${result.products.length} products from "${tile.title}"${dealType ? ` (${dealType})` : ' (no deal type found)'}`);
        } catch (err) {
          this.logger.warning(`  Failed to scrape deal page: ${tile.title}`);
        }
      }

      // Visit individual product pages (/p/ links) to get real product data
      const groceryProductTiles = productPageTiles.filter(t =>
        !isNonGroceryProduct(t.title) && !isAlcoholProduct(t.title)
      );
      this.logger.info(`Visiting ${groceryProductTiles.length} product pages (filtered ${productPageTiles.length - groceryProductTiles.length} non-grocery)...`);
      for (const tile of groceryProductTiles) {
        const url = `https://www.kruidvat.nl${tile.localizedURLLink}`;
        try {
          await this.randomDelay();
          this.logger.info(`Visiting product: ${tile.title}...`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          const productData = await this.extractSingleProduct(page, url);
          if (productData && productData.price > 0) {
            const dealType = tile.dealCategory
              || this.parseDealType(tile.localizedURLLink)
              || this.parseDealTypeFromTitle(tile.title);
            // Skip products with no deal indication
            if (!dealType && !productData.originalPrice) {
              this.logger.info(`  Skipping (no deal info): ${productData.title}`);
              continue;
            }
            const isCardDeal = tile.dealCategory?.toLowerCase().includes('kaart') || false;
            products.push({
              title: dealType ? `${productData.title} (${dealType})` : productData.title,
              discount_price: productData.price,
              original_price: productData.originalPrice || undefined,
              valid_from: monday,
              valid_until: sunday,
              category_slug: this.detectCategory(productData.title),
              product_url: url,
              image_url: this.normalizeImageUrl(productData.imageUrl),
              requires_card: isCardDeal,
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
   * Kruidvat uses e2-impression-tracker custom elements with data attributes
   * containing product name, price, URL, etc.
   * Also extracts the page-level deal type from the <h1> heading.
   */
  private async extractProductsFromDealPage(page: Page): Promise<{
    pageDealType: string | null;
    expired: boolean;
    requiresCard: boolean;
    products: Array<{
      title: string;
      price: number;
      originalPrice: number | null;
      url: string;
      imageUrl: string;
    }>;
  }> {
    return await page.evaluate(() => {
      const results: Array<{
        title: string;
        price: number;
        originalPrice: number | null;
        url: string;
        imageUrl: string;
      }> = [];

      // Extract deal type from page heading (e.g. "Therme 1+1 gratis", "Dove 50% korting")
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      let pageDealType: string | null = null;
      const expired = h1.toLowerCase().includes('verlopen');
      const requiresCard = h1.toLowerCase().includes('kaart');

      // Parse deal type from h1
      const h1Lower = h1.toLowerCase();
      if (h1Lower.includes('1+1 gratis') || h1Lower.includes('1 + 1 gratis')) pageDealType = '1+1 gratis';
      else if (h1Lower.match(/(\d)\s*\+\s*(\d)\s*gratis/)) {
        const m = h1Lower.match(/(\d)\s*\+\s*(\d)\s*gratis/)!;
        pageDealType = `${m[1]}+${m[2]} gratis`;
      }
      else if (h1Lower.includes('2e halve prijs')) pageDealType = '2e halve prijs';
      else if (h1Lower.includes('2e gratis')) pageDealType = '2e gratis';
      else if (h1Lower.includes('3e gratis')) pageDealType = '3e gratis';
      else if (h1Lower.match(/(\d+)\s*%\s*korting/)) {
        const m = h1Lower.match(/(\d+)\s*%\s*korting/)!;
        pageDealType = `${m[1]}% korting`;
      }
      else if (h1Lower.match(/voor\s*€?\s*(\d+)[,.](\d{2})/)) {
        const m = h1Lower.match(/voor\s*€?\s*(\d+)[,.](\d{2})/)!;
        pageDealType = `voor €${m[1]},${m[2]}`;
      }
      else if (h1Lower.match(/2e\s+voor\s*€?\s*(\d+)[,.](\d{2})/)) {
        const m = h1Lower.match(/2e\s+voor\s*€?\s*(\d+)[,.](\d{2})/)!;
        pageDealType = `2e voor €${m[1]},${m[2]}`;
      }
      else if (h1Lower.includes('gratis')) pageDealType = 'gratis';
      else if (h1Lower.includes('actieprijs')) pageDealType = 'actieprijs';

      // Strategy 1: e2-impression-tracker elements with data attributes (most reliable)
      const trackers = document.querySelectorAll('e2-impression-tracker.tile__product-slide');
      for (const tracker of Array.from(trackers)) {
        try {
          const title = tracker.getAttribute('data-item-name')?.trim() || '';
          if (!title || title.length < 3) continue;

          const priceStr = tracker.getAttribute('data-price');
          const price = priceStr ? parseFloat(priceStr) : 0;
          if (price <= 0) continue;

          const originalPriceStr = tracker.getAttribute('data-item-price-original');
          const originalPrice = originalPriceStr ? parseFloat(originalPriceStr) : null;

          const itemUrl = tracker.getAttribute('data-item-url') || '';
          const url = itemUrl ? `https://www.kruidvat.nl${itemUrl}` : '';

          const img = tracker.querySelector('img.tile__product-slide-image');
          const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';

          results.push({ title, price, originalPrice: originalPrice || null, url, imageUrl });
        } catch {}
      }

      // Strategy 2: Fallback to tile__product-slide-content with name link
      if (results.length === 0) {
        const tiles = document.querySelectorAll('.tile__product-slide-content, [class*="product-slide"], [class*="product-card"], [class*="product-tile"]');
        for (const tile of Array.from(tiles)) {
          try {
            let title = '';

            // Try the specific name link class
            const nameEl = tile.querySelector('a.tile__product-slide-product-name');
            if (nameEl) {
              title = nameEl.textContent?.trim() || '';
            }

            // Fallback: data-item-name on parent
            if (!title || title.length < 3) {
              const parent = tile.closest('e2-impression-tracker');
              title = parent?.getAttribute('data-item-name')?.trim() || '';
            }

            // Fallback: image aria-label (strip size suffix after " - ")
            if (!title || title.length < 3) {
              const img = tile.querySelector('img.tile__product-slide-image[aria-label]');
              const label = img?.getAttribute('aria-label') || '';
              title = label.replace(/\s*-\s*\d+.*$/, '').trim();
            }

            if (!title || title.length < 3) continue;

            // Price from pricebadge (updated class names)
            let price = 0;
            const decimalEl = tile.querySelector('.pricebadge__new-price-decimal');
            const fractionalEl = tile.querySelector('.pricebadge__new-price-fractional');
            if (decimalEl && fractionalEl) {
              price = parseFloat(`${decimalEl.textContent?.trim()}.${fractionalEl.textContent?.trim()}`);
            }

            if (price <= 0) {
              const text = tile.textContent || '';
              const priceMatch = text.match(/(\d+)\s*\.\s*(\d{2})/);
              if (priceMatch) price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
            }

            if (price <= 0) continue;

            // Image
            const img = tile.querySelector('img.tile__product-slide-image');
            const imageUrl = img?.getAttribute('src') || '';

            // URL
            const nameLink = tile.querySelector('a.tile__product-slide-product-name') as HTMLAnchorElement | null;
            const url = nameLink?.href || '';

            results.push({ title, price, originalPrice: null, url, imageUrl });
          } catch {}
        }
      }

      return { pageDealType, expired, requiresCard, products: results };
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
      const titleEl = document.querySelector('h1.product-title, h1[class*="product"], .pdp-header__title, h1');
      const title = titleEl?.textContent?.trim() || '';
      if (!title || title.length < 3) return null;

      // Price from pricebadge (updated selectors for current Kruidvat HTML)
      let price = 0;
      const priceBadge = document.querySelector('.pricebadge');
      if (priceBadge) {
        // Try new-style decimal/fractional classes first
        const decimalEl = priceBadge.querySelector('.pricebadge__new-price-decimal');
        const fractionalEl = priceBadge.querySelector('.pricebadge__new-price-fractional');
        if (decimalEl && fractionalEl) {
          price = parseFloat(`${decimalEl.textContent?.trim()}.${fractionalEl.textContent?.trim()}`);
        }
        // Fallback to old .pricetext structure
        if (price <= 0) {
          const newPriceEl = priceBadge.querySelector('.pricebadge__new-price .pricetext, .pricebadge__price .pricetext');
          if (newPriceEl) {
            const decimal = newPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
            const fractional = newPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
            price = parseFloat(`${decimal}.${fractional}`);
          }
        }
      }

      // Original price
      let originalPrice: number | null = null;
      const oldDecimal = document.querySelector('.pricebadge__old-price-decimal');
      const oldFractional = document.querySelector('.pricebadge__old-price-fractional');
      if (oldDecimal && oldFractional) {
        originalPrice = parseFloat(`${oldDecimal.textContent?.trim()}.${oldFractional.textContent?.trim()}`);
      }
      if (!originalPrice) {
        const oldPriceEl = document.querySelector('.pricebadge__old-price .pricetext');
        if (oldPriceEl) {
          const decimal = oldPriceEl.querySelector('.pricetext__decimal')?.textContent?.trim() || '0';
          const fractional = oldPriceEl.querySelector('.pricetext__fractional')?.textContent?.trim() || '00';
          originalPrice = parseFloat(`${decimal}.${fractional}`);
        }
      }

      // Image
      const img = document.querySelector('.product-image img, img[class*="product-detail"], img.tile__product-slide-image');
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
