/**
 * Aldi Scraper
 * Scrapes discount offers from Aldi Netherlands website
 * Aldi uses a Next.js app - we extract product data from embedded JSON
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

      // Wait for content to render (Next.js app needs time to hydrate)
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(10000);

      // Strategy 1: Try to extract from __NEXT_DATA__ (Next.js embedded JSON)
      const jsonProducts = await this.extractFromNextData(page);
      if (jsonProducts.length > 0) {
        this.logger.success(`Extracted ${jsonProducts.length} products from JSON data`);
        return jsonProducts;
      }

      // Strategy 2: Try to extract from any embedded JSON/script tags
      const scriptProducts = await this.extractFromScriptTags(page);
      if (scriptProducts.length > 0) {
        this.logger.success(`Extracted ${scriptProducts.length} products from script tags`);
        return scriptProducts;
      }

      // Strategy 3: Fallback to DOM scraping - extract structured data from each card
      this.logger.info('JSON extraction failed, falling back to DOM scraping...');
      await this.scrollToLoad(page);

      const { monday, sunday } = this.getWeekDates();

      // Extract all product data in a single page.evaluate to avoid per-element round-trips
      const extractedProducts = await page.evaluate(() => {
        const results: Array<{
          title: string;
          price: string;
          imageUrl: string | null;
          productUrl: string | null;
        }> = [];

        // Find all product tile elements
        const cards = document.querySelectorAll(
          'a[href*="/aanbiedingen/"], a[href*="/actie/"], [class*="offer-tile"], [class*="product-tile"]'
        );

        for (const card of Array.from(cards)) {
          // Extract title from heading elements (h2, h3, h4) - these usually contain just the product name
          let title = '';
          const headingEl = card.querySelector('h3, h4, h2');
          if (headingEl) {
            title = (headingEl as HTMLElement).innerText?.trim() || '';
          }
          if (!title) {
            const titleEl = card.querySelector('[class*="title"], [class*="name"], [class*="description"]');
            if (titleEl) {
              title = (titleEl as HTMLElement).innerText?.trim() || '';
            }
          }
          if (!title || title.length < 3) continue;

          // Extract price from price elements
          let priceText = '';
          const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
          if (priceEl) {
            priceText = (priceEl as HTMLElement).innerText?.trim() || '';
          }
          // Fallback: get all text and find price pattern
          if (!priceText) {
            priceText = (card as HTMLElement).innerText || '';
          }

          // Extract image
          const img = card.querySelector('img');
          let imageUrl: string | null = null;
          if (img) {
            imageUrl = img.getAttribute('src') || img.getAttribute('data-src') || null;
          }

          // Extract link
          let productUrl: string | null = null;
          const link = card.closest('a') || card.querySelector('a');
          if (link) {
            productUrl = link.getAttribute('href');
          }

          results.push({ title, price: priceText, imageUrl, productUrl });
        }

        return results;
      });

      this.logger.info(`Found ${extractedProducts.length} product candidates via DOM`);

      const seenTitles = new Set<string>();

      for (const item of extractedProducts) {
        // Clean title: remove anything after price/percentage patterns
        let title = item.title
          .replace(/-?\d+%.*$/, '')  // Remove from percentage onward
          .replace(/\d+[,.]\d{2}.*$/, '') // Remove from price onward
          .replace(/OP=OP.*$/i, '')  // Remove OP=OP suffix
          .replace(/Boodschappenlijstje.*$/i, '')  // Remove UI button text
          .replace(/\{.*$/s, '')  // Remove JSON remnants
          .trim();

        if (!title || title.length < 3 || title.length > 100) continue;

        // Skip titles that are clearly not product names
        if (/^\d/.test(title)) continue; // Starts with number
        if (/^(kg|g|ml|l|cl|per|van|op=op)\b/i.test(title)) continue; // Starts with unit/keyword
        if (/^[€$]/.test(title)) continue; // Starts with currency

        // Skip Aldi section/category headers (not actual products)
        const sectionHeaders = [
          'aardappelen, groenten en fruit', 'vlees, vis & vega', 'bloemen en planten',
          'alleen dit weekend', 'brood & bakkerij', 'zuivel & eieren', 'kaas',
          'dranken', 'huishouden', 'diepvries', 'snoep & chips',
        ];
        if (sectionHeaders.includes(title.toLowerCase())) continue;

        // Deduplicate by normalized title
        const normalizedTitle = title.toLowerCase();
        if (seenTitles.has(normalizedTitle)) continue;
        seenTitles.add(normalizedTitle);

        // Extract price
        let price = 0;
        const priceMatch = item.price.match(/(\d+)[,.](\d{2})/);
        if (priceMatch) {
          price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
        }
        if (price <= 0) continue;

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
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(title),
          product_url: productUrl,
          image_url: imageUrl,
        });
      }

      this.logger.success(`Scraped ${products.length} products from Aldi`);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }

    return products;
  }

  private async extractFromNextData(page: any): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    try {
      const nextData = await page.evaluate(() => {
        const el = document.querySelector('script#__NEXT_DATA__');
        return el ? el.textContent : null;
      });

      if (!nextData) return products;

      const parsed = JSON.parse(nextData);
      const { monday, sunday } = this.getWeekDates();

      // Navigate the Next.js data structure to find products
      const findProducts = (obj: any): any[] => {
        if (!obj || typeof obj !== 'object') return [];
        if (Array.isArray(obj)) {
          return obj.flatMap(item => findProducts(item));
        }
        // Look for objects that look like products (have name/title and price)
        if (obj.name && (obj.currentPrice || obj.price || obj.priceValue)) {
          return [obj];
        }
        // Look for algoliaDataMap or similar
        if (obj.algoliaDataMap) {
          return Object.values(obj.algoliaDataMap);
        }
        return Object.values(obj).flatMap(v => findProducts(v));
      };

      const productData = findProducts(parsed);
      this.logger.info(`Found ${productData.length} products in __NEXT_DATA__`);

      for (const item of productData) {
        try {
          const title = item.name || item.title;
          if (!title) continue;

          let price = 0;
          if (item.currentPrice?.priceValue) {
            price = parseFloat(item.currentPrice.priceValue);
          } else if (item.price) {
            price = typeof item.price === 'string' ? parseFloat(item.price.replace(',', '.')) : item.price;
          }
          if (price <= 0) continue;

          let originalPrice: number | undefined;
          if (item.currentPrice?.strikePrice?.strikePriceValue) {
            originalPrice = parseFloat(item.currentPrice.strikePrice.strikePriceValue);
          }

          let imageUrl: string | undefined;
          if (item.assets?.[0]?.url) {
            imageUrl = item.assets[0].url;
          } else if (item.image) {
            imageUrl = item.image;
          }

          let productUrl: string | undefined;
          if (item.productSlug) {
            productUrl = `https://www.aldi.nl/aanbiedingen/${item.productSlug}.html`;
          } else if (item.url) {
            productUrl = item.url.startsWith('http') ? item.url : `https://www.aldi.nl${item.url}`;
          }

          products.push({
            title,
            discount_price: price,
            original_price: originalPrice,
            valid_from: monday,
            valid_until: sunday,
            category_slug: this.detectCategory(title),
            product_url: productUrl,
            image_url: imageUrl,
          });
        } catch (err) {
          // Skip individual product errors
        }
      }
    } catch (err) {
      this.logger.debug('__NEXT_DATA__ extraction failed:', err);
    }
    return products;
  }

  private async extractFromScriptTags(page: any): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    try {
      // Look for JSON-LD structured data
      const jsonLdData = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        return Array.from(scripts).map(s => s.textContent).filter(Boolean);
      });

      const { monday, sunday } = this.getWeekDates();

      for (const jsonStr of jsonLdData) {
        try {
          const data = JSON.parse(jsonStr!);
          const items = Array.isArray(data) ? data : data.itemListElement || data.offers || [data];

          for (const item of items) {
            if (item['@type'] === 'Product' || item['@type'] === 'Offer' || item.name) {
              const title = item.name;
              if (!title) continue;

              let price = 0;
              if (item.offers?.price) price = parseFloat(item.offers.price);
              else if (item.price) price = parseFloat(item.price);
              if (price <= 0) continue;

              products.push({
                title,
                discount_price: price,
                valid_from: monday,
                valid_until: sunday,
                category_slug: this.detectCategory(title),
                product_url: item.url,
                image_url: item.image,
              });
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    } catch (err) {
      this.logger.debug('Script tag extraction failed:', err);
    }
    return products;
  }

  private async scrollToLoad(page: any): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
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
