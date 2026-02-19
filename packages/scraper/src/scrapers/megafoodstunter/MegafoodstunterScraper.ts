/**
 * Megafoodstunter Scraper
 * Scrapes discount products from megafoodstunter.nl
 * WooCommerce site - products displayed on category pages
 *
 * Product card structure (li.product):
 *   .product-inner
 *     .mfst-discount-badge .mfs-kortingsbalk → "1+1 Gratis t/m 23-02 12:00"
 *     .onsale                → "-48%"
 *     img                    → product image
 *     h3.woocommerce-loop-product__title → "Ciabatta 20×440 gram"
 *     .mfst-cloud-content    → "20 stuks", "THT: ..."
 *     .price-box.red-box     → original price (.old-price-label) + current price (.main-price)
 *     .price-box.blue-box    → per-unit price
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

const CATEGORY_URLS = [
  'https://megafoodstunter.nl/product-categorie/bakkerij/',
  'https://megafoodstunter.nl/product-categorie/vlees/',
  'https://megafoodstunter.nl/product-categorie/kip/',
  'https://megafoodstunter.nl/product-categorie/snacks/',
  'https://megafoodstunter.nl/product-categorie/patisserie/',
  'https://megafoodstunter.nl/product-categorie/ijs/',
  'https://megafoodstunter.nl/product-categorie/groente-en-fruit/groente/',
  'https://megafoodstunter.nl/product-categorie/vegetarisch/',
  'https://megafoodstunter.nl/product-categorie/aardappel-producten/',
];

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
    const allProducts: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    try {
      // Visit homepage first for cookies
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Scrape each category page
      for (const catUrl of CATEGORY_URLS) {
        try {
          const catName = catUrl.split('/product-categorie/')[1]?.replace(/\//g, '');
          this.logger.info(`Scraping category: ${catName}...`);
          await this.randomDelay();
          await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          const products = await page.evaluate(() => {
            const results: Array<{
              title: string;
              discountPrice: number;
              originalPrice: number | null;
              discountPercentage: number | null;
              unitInfo: string | null;
              dealType: string | null;
              imageUrl: string;
              productUrl: string;
            }> = [];

            const cards = document.querySelectorAll('li.product');
            for (const card of Array.from(cards)) {
              try {
                // Title
                const titleEl = card.querySelector('h3.woocommerce-loop-product__title, .product-loop-title h3');
                const title = titleEl?.textContent?.trim() || '';
                if (!title || title.length < 3) continue;

                // Current price from .main-price
                let discountPrice = 0;
                const mainPriceEl = card.querySelector('.main-price');
                if (mainPriceEl) {
                  const intPart = mainPriceEl.querySelector('.price-int')?.textContent?.trim()?.replace('.', '') || '0';
                  const decPart = mainPriceEl.querySelector('.price-dec')?.textContent?.trim() || '00';
                  discountPrice = parseFloat(`${intPart}.${decPart}`);
                }
                if (discountPrice <= 0) continue;

                // Original price
                let originalPrice: number | null = null;
                const oldPriceEl = card.querySelector('.old-price-label');
                if (oldPriceEl) {
                  const oldText = oldPriceEl.textContent?.trim() || '';
                  const match = oldText.match(/(\d+)[,.](\d{2})/);
                  if (match) originalPrice = parseFloat(`${match[1]}.${match[2]}`);
                }

                // Discount percentage
                let discountPercentage: number | null = null;
                const saleEl = card.querySelector('.onsale');
                if (saleEl) {
                  const saleText = saleEl.textContent?.trim() || '';
                  const match = saleText.match(/(\d+)/);
                  if (match) discountPercentage = parseInt(match[1]);
                }

                // Deal type
                let dealType: string | null = null;
                const dealEl = card.querySelector('.mfs-kortingsbalk');
                if (dealEl) {
                  dealType = dealEl.textContent?.trim() || null;
                }

                // Unit info
                const clouds = card.querySelectorAll('.mfst-cloud-content');
                const unitParts: string[] = [];
                for (const cloud of Array.from(clouds)) {
                  const text = cloud.textContent?.trim() || '';
                  if (text && !text.includes('Spaar') && !text.includes('Punten')) {
                    unitParts.push(text);
                  }
                }

                // Per-unit price — append to unit info
                const unitPriceEl = card.querySelector('.unit-price');
                if (unitPriceEl) {
                  const uIntPart = unitPriceEl.querySelector('.price-int')?.textContent?.trim()?.replace('.', '') || '';
                  const uDecPart = unitPriceEl.querySelector('.price-dec')?.textContent?.trim() || '';
                  if (uIntPart) {
                    const unitLabel = card.querySelector('.unit-label')?.textContent?.trim() || 'per stuk';
                    unitParts.push(`€${uIntPart}.${uDecPart} ${unitLabel}`);
                  }
                }

                const unitInfo = unitParts.length > 0 ? unitParts.join(' · ') : null;

                // Image
                const img = card.querySelector('.product-image img');
                const imageUrl = img?.getAttribute('src') || '';

                // Product URL
                const link = card.querySelector('a.product-loop-title, a[href*="/product/"]') as HTMLAnchorElement;
                const productUrl = link?.href || '';

                results.push({
                  title,
                  discountPrice,
                  originalPrice,
                  discountPercentage,
                  unitInfo,
                  dealType,
                  imageUrl,
                  productUrl,
                });
              } catch {}
            }
            return results;
          });

          for (const p of products) {
            const fullTitle = p.dealType
              ? `${p.title} (${p.dealType.replace(/\s+t\/m.*/, '')})`
              : p.title;

            allProducts.push({
              title: fullTitle,
              discount_price: p.discountPrice,
              original_price: p.originalPrice || undefined,
              discount_percentage: p.discountPercentage || undefined,
              unit_info: p.unitInfo || undefined,
              valid_from: monday,
              valid_until: sunday,
              category_slug: this.detectCategory(p.title),
              product_url: p.productUrl || undefined,
              image_url: p.imageUrl || undefined,
            });
          }

          this.logger.info(`  Found ${products.length} products in ${catName}`);
        } catch (err) {
          this.logger.warning(`  Failed to scrape category: ${catUrl}`);
        }
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const deduped = allProducts.filter(p => {
        const key = p.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.logger.success(`Total: ${deduped.length} products from Megafoodstunter`);
      return deduped;
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }
  }
}
