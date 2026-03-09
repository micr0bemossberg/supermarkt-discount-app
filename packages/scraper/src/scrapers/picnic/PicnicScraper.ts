/**
 * Picnic Scraper
 * Uses the picnic-api npm package to fetch deals from Picnic's mobile API.
 * Requires PICNIC_EMAIL and PICNIC_PASSWORD in .env
 *
 * Strategy:
 *   1. Login with credentials
 *   2. Search many category terms via /pages/search-page-results
 *   3. Walk the Server-Driven UI tree to find promo tiles
 *   4. Match promo analytics (label, price, strikethrough) with sellingUnit data (name, image)
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';
import { JSONPath } from 'jsonpath-plus';

// picnic-api uses CommonJS exports
import PicnicClient = require('picnic-api');

interface SellingUnit {
  id: string;
  name: string;
  display_price: number;
  image_id: string;
  unit_quantity: string;
}

interface PromoTile {
  unitId: string;
  label: string;
  price: number;
  strikePrice?: number;
}

// Search terms covering major grocery categories
const SEARCH_TERMS = [
  'melk', 'kaas', 'yoghurt', 'boter', 'eieren',
  'brood', 'croissant',
  'kip', 'gehakt', 'vlees', 'vis', 'zalm',
  'groente', 'fruit', 'tomaat', 'appel', 'banaan',
  'pasta', 'rijst', 'saus', 'soep',
  'chips', 'chocolade', 'koek', 'noten', 'snoep',
  'cola', 'bier', 'wijn', 'sap', 'koffie', 'thee', 'water',
  'pizza', 'ijs',
  'wasmiddel', 'shampoo', 'tandpasta', 'toiletpapier',
  'luier', 'zeep',
];

export class PicnicScraper extends BaseScraper {
  private client: InstanceType<typeof PicnicClient> | null = null;

  constructor() {
    super('picnic', 'https://www.picnic.app');
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

  private getImageUrl(imageId: string): string {
    return `https://storefront-prod.nl.picnicinternational.com/static/images/${imageId}/medium.png`;
  }

  /**
   * Recursively find SELLING_UNIT_MUTATION nodes to get the sellingUnitId.
   */
  private findSellingUnitId(obj: any): string | null {
    if (obj === null || obj === undefined || typeof obj !== 'object') return null;
    if (obj.type === 'SELLING_UNIT_MUTATION' && obj.sellingUnitId) return obj.sellingUnitId;
    if (obj.actionType === 'EVENT' && obj.event?.sellingUnitId) return obj.event.sellingUnitId;

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            const result = this.findSellingUnitId(item);
            if (result) return result;
          }
        } else {
          const result = this.findSellingUnitId(val);
          if (result) return result;
        }
      }
    }
    return null;
  }

  /**
   * Walk the Server-Driven UI tree to find nodes with promotion analytics,
   * then find the associated sellingUnitId in their subtree.
   */
  private findPromoTiles(obj: any, results: PromoTile[]): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return;

    // Check if this node has analytics with promotion_label
    if (obj.analytics?.contexts) {
      let promoData: any = null;
      for (const ctx of obj.analytics.contexts) {
        if (ctx.data?.promotion_label) {
          promoData = ctx.data;
          break;
        }
      }

      if (promoData) {
        const unitId = this.findSellingUnitId(obj);
        if (unitId) {
          results.push({
            unitId,
            label: promoData.promotion_label,
            price: promoData.price,
            strikePrice: promoData.strikethrough_price,
          });
          return;
        }
      }
    }

    // Recurse into children
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === 'object') this.findPromoTiles(item, results);
          }
        } else {
          this.findPromoTiles(val, results);
        }
      }
    }
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const email = process.env.PICNIC_EMAIL;
    const password = process.env.PICNIC_PASSWORD;

    if (!email || !password) {
      throw new Error('PICNIC_EMAIL and PICNIC_PASSWORD must be set in .env');
    }

    this.client = new PicnicClient({ countryCode: 'NL' });

    this.logger.info('Logging in to Picnic...');
    const loginResult = await this.client.login(email, password);

    if (loginResult.second_factor_authentication_required) {
      this.logger.warning(
        'Picnic API flagged 2FA required (likely new IP). Auth key was received, continuing...',
      );
    }

    this.logger.success(`Logged in as ${loginResult.user_id}`);

    // Collect all promo products across multiple searches
    const allPromoTiles = new Map<string, { tile: PromoTile; unit: SellingUnit }>();

    for (const term of SEARCH_TERMS) {
      try {
        const raw = await this.client.sendRequest<null, any>(
          'GET',
          `/pages/search-page-results?search_term=${encodeURIComponent(term)}`,
          null,
          true,
        );

        // Extract sellingUnit objects via JSONPath
        const units: SellingUnit[] = JSONPath({ path: '$..sellingUnit', json: raw });
        const unitMap = new Map<string, SellingUnit>();
        for (const u of units) {
          unitMap.set(u.id, u);
        }

        // Find promo tiles by walking the tree
        const promoTiles: PromoTile[] = [];
        this.findPromoTiles(raw, promoTiles);

        let newCount = 0;
        for (const tile of promoTiles) {
          if (!allPromoTiles.has(tile.unitId)) {
            const unit = unitMap.get(tile.unitId);
            if (unit) {
              allPromoTiles.set(tile.unitId, { tile, unit });
              newCount++;
            }
          }
        }

        if (promoTiles.length > 0) {
          this.logger.debug(
            `"${term}": ${promoTiles.length} promos (${newCount} new, ${allPromoTiles.size} total)`,
          );
        }

        // Delay between searches
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        this.logger.warning(`Search for "${term}" failed:`, err);
      }
    }

    this.logger.info(`Found ${allPromoTiles.size} unique promo products`);

    // Convert to ScrapedProduct format
    const products: ScrapedProduct[] = [];
    const { monday, sunday } = this.getWeekDates();

    for (const [, { tile, unit }] of allPromoTiles) {
      const currentPrice = tile.price / 100;
      const originalPrice = tile.strikePrice ? tile.strikePrice / 100 : undefined;

      let discountPercentage: number | undefined;
      if (originalPrice && originalPrice > currentPrice) {
        discountPercentage = Math.round(
          ((originalPrice - currentPrice) / originalPrice) * 100,
        );
      }

      const title = `${unit.name} (${tile.label})`;

      products.push({
        title,
        discount_price: currentPrice,
        original_price: originalPrice,
        discount_percentage: discountPercentage,
        unit_info: unit.unit_quantity,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(unit.name),
        image_url: this.getImageUrl(unit.image_id),
      });
    }

    this.logger.success(`Total: ${products.length} promo products from Picnic`);
    return products;
  }
}
