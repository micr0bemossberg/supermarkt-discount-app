/**
 * Albert Heijn Scraper
 * Uses AH's mobile API directly instead of browser scraping.
 * AH blocks headless browsers, but their mobile API accepts anonymous tokens.
 *
 * Flow:
 * 1. Get anonymous auth token from AH mobile-auth endpoint
 * 2. Search products via the product search API
 * 3. Filter for isBonus === true to get this week's bonus products
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

const AH_AUTH_URL = 'https://api.ah.nl/mobile-auth/v1/auth/token/anonymous';
const AH_SEARCH_URL = 'https://api.ah.nl/mobile-services/product/search/v2';

interface AHProduct {
  webshopId: number;
  title: string;
  salesUnitSize?: string;
  unitPriceDescription?: string;
  images?: Array<{ width: number; height: number; url: string }>;
  currentPrice?: number;
  priceBeforeBonus?: number;
  isBonus: boolean;
  bonusMechanism?: string;
  mainCategory?: string;
  subCategory?: string;
  brand?: string;
  discountLabels?: Array<{ code: string; defaultDescription: string; percentage?: number }>;
  alcoholPercentage?: number;
  isOnlineOnly?: boolean;
  isOrderable?: boolean;
  propertyIcons?: string[];
}

export class AHScraper extends BaseScraper {
  constructor() {
    super('ah', 'https://www.ah.nl/bonus');
  }

  /**
   * Classify AH deal type from discount label text and bonus mechanism
   */
  private classifyDealType(dealLabel: string, bonusMechanism?: string): string {
    if (!dealLabel && !bonusMechanism) return 'bonus';

    // "2e gratis" = buy one get one free
    if (/2e\s*gratis/i.test(dealLabel)) return '1+1_gratis';

    // Multi-buy free deals: "1+1 gratis", "2+1 gratis", "3+2 gratis"
    if (/(\d)\s*\+\s*(\d)\s*gratis/i.test(dealLabel)) {
      const match = dealLabel.match(/(\d)\s*\+\s*(\d)\s*gratis/i);
      if (match) {
        const buy = match[1], free = match[2];
        if (buy === '1' && free === '1') return '1+1_gratis';
        if (buy === '2' && free === '1') return '2+1_gratis';
        return `${buy}+${free}_gratis`;
      }
    }

    // Second half price
    if (/2e\s*(halve\s*prijs|voor\s*de\s*helft)/i.test(dealLabel)) return '2e_halve_prijs';

    // X voor Y deals: "2 voor 3.49", "3 voor 5"
    if (/\d+\s*voor\s*[\d.,]+/i.test(dealLabel)) return 'x_voor_y';

    // Percentage korting / volume voordeel
    if (/\d+%\s*(korting|volume\s*voordeel)/i.test(dealLabel)) return 'korting';

    // Flat discount (price reduction)
    if (bonusMechanism === 'BONUS_PRICE') return 'korting';

    // Also check bonusMechanism for patterns not in dealLabel
    if (bonusMechanism) {
      const mech = bonusMechanism.toLowerCase();
      if (/2e\s*gratis/i.test(mech)) return '1+1_gratis';
      if (/(\d)\s*\+\s*(\d)\s*gratis/i.test(mech)) {
        const m = mech.match(/(\d)\s*\+\s*(\d)\s*gratis/i);
        if (m) return m[1] === '1' && m[2] === '1' ? '1+1_gratis' : `${m[1]}+${m[2]}_gratis`;
      }
      if (/2e\s*halve/i.test(mech)) return '2e_halve_prijs';
      if (/\d+\s*voor\s*[\d.,]+/i.test(mech)) return 'x_voor_y';
      if (/volume\s*voordeel/i.test(mech)) return 'korting';
    }

    return 'bonus';
  }

  private detectCategory(title: string, mainCategory?: string): string {
    // Try main category from API first
    if (mainCategory) {
      const lowerCat = mainCategory.toLowerCase();
      if (lowerCat.includes('brood') || lowerCat.includes('bakkerij')) return 'vers-gebak';
      if (lowerCat.includes('vlees') || lowerCat.includes('vis') || lowerCat.includes('kip')) return 'vlees-vis-vega';
      if (lowerCat.includes('zuivel') || lowerCat.includes('kaas') || lowerCat.includes('melk')) return 'zuivel-eieren';
      if (lowerCat.includes('groente') || lowerCat.includes('fruit') || lowerCat.includes('aardappel')) return 'groente-fruit';
      if (lowerCat.includes('diepvries')) return 'diepvries';
      if (lowerCat.includes('fris') || lowerCat.includes('sap') || lowerCat.includes('water') || lowerCat.includes('drank') || lowerCat.includes('bier') || lowerCat.includes('wijn')) return 'dranken';
      if (lowerCat.includes('pasta') || lowerCat.includes('rijst') || lowerCat.includes('soep') || lowerCat.includes('saus') || lowerCat.includes('conserven')) return 'bewaren';
      if (lowerCat.includes('ontbijt') || lowerCat.includes('granen') || lowerCat.includes('beleg')) return 'ontbijt';
      if (lowerCat.includes('baby') || lowerCat.includes('kind')) return 'baby-kind';
      if (lowerCat.includes('elektr') || lowerCat.includes('batterij')) return 'elektronica';
      if (lowerCat.includes('snoep') || lowerCat.includes('koek') || lowerCat.includes('chips') || lowerCat.includes('noot')) return 'snoep-chips';
      if (lowerCat.includes('schoonmaak') || lowerCat.includes('wasmiddel') || lowerCat.includes('huishoud')) return 'huishouden';
      if (lowerCat.includes('verzorging') || lowerCat.includes('tandpasta') || lowerCat.includes('shampoo')) return 'persoonlijke-verzorging';
    }

    // Fall back to keyword detection from title
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
   * Get anonymous auth token from AH API
   */
  private async getAuthToken(): Promise<string> {
    const response = await fetch(AH_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Appie/8.22.3',
      },
      body: JSON.stringify({ clientId: 'appie' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get AH auth token: ${response.status}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }

  /**
   * Fetch a page of products from AH search API
   */
  private async fetchProductPage(token: string, page: number, size: number): Promise<{ products: AHProduct[]; totalElements: number }> {
    const url = `${AH_SEARCH_URL}?page=${page}&size=${size}&query=&sortOn=RELEVANCE`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Appie/8.22.3',
        'Accept': 'application/json',
        'X-Application': 'AHWEBSHOP',
      },
    });

    if (!response.ok) {
      throw new Error(`AH API error: ${response.status}`);
    }

    const data = await response.json() as { page: { totalElements: number }; products: AHProduct[] };
    return {
      products: data.products || [],
      totalElements: data.page?.totalElements || 0,
    };
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    // No browser needed - use API directly
    this.logger.info('Getting AH API auth token...');
    const token = await this.getAuthToken();
    this.logger.success('Got auth token');

    const { monday, sunday } = this.getWeekDates();
    const bonusProducts: ScrapedProduct[] = [];
    const seenIds = new Set<number>();

    const PAGE_SIZE = 200;

    // Scan ALL pages — bonus products are spread across the entire 10000+ catalog
    let page = 0;
    let totalElements = 0;

    while (true) {
      this.logger.info(`Fetching page ${page + 1}...`);

      let result: { products: AHProduct[]; totalElements: number };
      try {
        result = await this.fetchProductPage(token, page, PAGE_SIZE);
      } catch (err: any) {
        // AH API returns 400 after ~15 pages (3000 products) even though totalElements says 10000+
        // Gracefully stop and keep what we've found so far
        this.logger.warning(`API returned error on page ${page + 1}: ${err.message}`);
        this.logger.info(`Stopping pagination — collected ${bonusProducts.length} bonus products so far`);
        break;
      }

      if (page === 0) {
        totalElements = result.totalElements;
        this.logger.info(`Total products in catalog: ${totalElements}`);
      }

      if (result.products.length === 0) break;

      // Filter for bonus products
      for (const product of result.products) {
        if (!product.isBonus) continue;
        if (seenIds.has(product.webshopId)) continue;
        seenIds.add(product.webshopId);

        // Skip alcohol products (AH API provides alcoholPercentage)
        if (product.alcoholPercentage && product.alcoholPercentage > 0) continue;

        const price = product.currentPrice || product.priceBeforeBonus;
        if (!price || price <= 0) continue;

        // Get the best image (400px)
        let imageUrl: string | undefined;
        if (product.images && product.images.length > 0) {
          const img400 = product.images.find(img => img.width === 400);
          imageUrl = img400?.url || product.images[0].url;
        }

        // Calculate discount percentage from labels or prices
        let discountPercentage: number | undefined;
        if (product.discountLabels?.[0]?.percentage) {
          discountPercentage = product.discountLabels[0].percentage;
        } else if (product.currentPrice && product.priceBeforeBonus && product.priceBeforeBonus > product.currentPrice) {
          discountPercentage = Math.round(((product.priceBeforeBonus - product.currentPrice) / product.priceBeforeBonus) * 100);
        }

        // Classify deal type from discount labels
        const rawDealLabel = product.discountLabels?.[0]?.defaultDescription || '';
        const dealType = this.classifyDealType(rawDealLabel.toLowerCase(), product.bonusMechanism);

        // Detect online-only: API field OR "volume voordeel" bundles (web-exclusive multi-packs on AH)
        const isOnline = product.isOnlineOnly ||
          (product.bonusMechanism?.toLowerCase().includes('volume voordeel') ?? false);

        // Use discountLabel text, fall back to bonusMechanism for description
        const dealDescription = rawDealLabel || product.bonusMechanism || undefined;

        bonusProducts.push({
          title: product.title,
          description: dealDescription,
          discount_price: product.currentPrice || price,
          original_price: product.priceBeforeBonus && product.priceBeforeBonus > (product.currentPrice || 0)
            ? product.priceBeforeBonus : undefined,
          discount_percentage: discountPercentage,
          deal_type: dealType,
          valid_from: monday,
          valid_until: sunday,
          category_slug: this.detectCategory(product.title, product.mainCategory),
          product_url: `https://www.ah.nl/producten/product/wi${product.webshopId}`,
          image_url: imageUrl,
          unit_info: product.salesUnitSize,
          is_online_only: isOnline,
        });
      }

      this.logger.info(`Page ${page + 1}: ${result.products.length} products, ${bonusProducts.length} bonus found so far`);

      // Stop when we've scanned all pages
      if ((page + 1) * PAGE_SIZE >= totalElements) break;

      page++;

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    this.logger.success(`Found ${bonusProducts.length} bonus products from AH API`);
    return bonusProducts;
  }
}
