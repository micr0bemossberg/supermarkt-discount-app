/**
 * Vomar Scraper
 * Extracts deals from Vomar's weekly folder via Publitas embedded text.
 * Then enriches products with images from Vomar's catalog API.
 *
 * Flow:
 * 1. Load Publitas viewer in Playwright to get spreads.json (contains text per page)
 * 2. Parse product names and prices from the text
 * 3. Search Vomar catalog API for product images
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

const VOMAR_API_BASE = 'https://api.vomar.nl/api/v1';
const VOMAR_IMAGE_CDN = 'https://d3vricquk1sjgf.cloudfront.net/articles';

interface ParsedProduct {
  name: string;
  price: number;
  originalPrice?: number;
  discountType?: string;
}

interface VomarSearchResult {
  articleNumber: number;
  description: string;
  detailedDescription?: string;
  price: number;
  images?: Array<{ imageUrl: string }>;
  brand?: string;
}

export class VomarScraper extends BaseScraper {
  constructor() {
    super('vomar', 'https://www.vomar.nl/aanbiedingen');
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
   * Fetch spreads.json from Publitas viewer via Playwright
   */
  private async fetchSpreadsData(): Promise<any[]> {
    const page = await this.initBrowser();

    return new Promise(async (resolve, reject) => {
      let spreadsData: any = null;

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('spreads.json')) {
          try {
            spreadsData = await response.json();
            this.logger.success(`Got spreads.json with ${Array.isArray(spreadsData) ? spreadsData.length : Object.keys(spreadsData).length} entries`);
          } catch (e) {
            this.logger.warning('Failed to parse spreads.json');
          }
        }
      });

      try {
        this.logger.info('Loading Publitas folder viewer...');
        await page.goto('https://view.publitas.com/folder-deze-week', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await page.waitForTimeout(3000);

        if (!spreadsData) {
          reject(new Error('Failed to capture spreads.json from Publitas'));
          return;
        }

        // Normalize to array
        const spreads = Array.isArray(spreadsData)
          ? spreadsData
          : Object.values(spreadsData);

        resolve(spreads);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Extract all page texts from spreads data
   */
  private extractPageTexts(spreads: any[]): Array<{ pageNum: number; text: string }> {
    const pages: Array<{ pageNum: number; text: string }> = [];

    for (const spread of spreads) {
      if (!spread?.pages) continue;
      for (const page of spread.pages) {
        if (page.text && page.text.trim()) {
          pages.push({
            pageNum: page.number || 0,
            text: page.text,
          });
        }
      }
    }

    return pages;
  }

  /**
   * Parse products from all folder pages.
   * Uses multiple strategies to extract product name + price combinations.
   */
  private parseProducts(pages: Array<{ pageNum: number; text: string }>): ParsedProduct[] {
    const products: ParsedProduct[] = [];
    const seenNames = new Set<string>();

    // Skip non-product pages (price comparison, bedding promo, non-food household, clothing)
    const skipPages = new Set([17, 32, 36, 37, 38, 39, 44]);

    for (const { pageNum, text } of pages) {
      if (skipPages.has(pageNum)) continue;

      const lines = text.split('\n').map(l => l.trim());

      // Find BOGOF deals: look for "1+1 GRATIS" patterns with nearby prices
      for (let i = 0; i < lines.length; i++) {
        if (/^(\d)\s*\+\s*(\d)$/.test(lines[i]) || /GRATIS/.test(lines[i])) {
          // Look for the GRATIS line
          let gratisIdx = i;
          if (!/GRATIS/.test(lines[i])) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              if (/GRATIS/.test(lines[j])) { gratisIdx = j; break; }
            }
          }

          // Find prices after GRATIS
          const prices: number[] = [];
          for (let j = gratisIdx + 1; j < Math.min(gratisIdx + 4, lines.length); j++) {
            const p = this.parsePrice(lines[j]);
            if (p > 0) prices.push(p);
          }

          if (prices.length >= 2) {
            // Find product name above the deal
            const name = this.findProductNameAbove(lines, Math.min(i, gratisIdx));
            if (name && !seenNames.has(name.toLowerCase())) {
              seenNames.add(name.toLowerCase());
              products.push({
                name,
                price: prices[prices.length - 1], // Last price is the deal price
                originalPrice: prices[0],
                discountType: '1+1 GRATIS',
              });
            }
          }
        }
      }

      // Find "XX% KORTING" deals
      for (let i = 0; i < lines.length; i++) {
        const kortingMatch = lines[i].match(/(\d+)%/) || lines[i].match(/KORTING/);
        if (!kortingMatch) continue;

        // Confirm KORTING is nearby
        const hasKorting = /KORTING/i.test(lines[i]) ||
          (i + 1 < lines.length && /KORTING/i.test(lines[i + 1])) ||
          (i > 0 && /KORTING/i.test(lines[i - 1]));
        if (!hasKorting) continue;

        // Find prices nearby (before and after)
        const nearbyPrices: number[] = [];
        for (let j = Math.max(0, i - 3); j < Math.min(i + 5, lines.length); j++) {
          const p = this.parsePrice(lines[j]);
          if (p > 0) nearbyPrices.push(p);
        }

        if (nearbyPrices.length >= 2) {
          const name = this.findProductNameAbove(lines, i);
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            const percentMatch = text.substring(
              Math.max(0, text.indexOf(lines[i]) - 20),
              text.indexOf(lines[i]) + lines[i].length + 20
            ).match(/(\d+)%/);
            products.push({
              name,
              price: nearbyPrices[nearbyPrices.length - 1],
              originalPrice: nearbyPrices[0],
              discountType: percentMatch ? `${percentMatch[1]}% KORTING` : 'KORTING',
            });
          }
        }
      }

      // Find standalone priced products (like "2.99" or "1.49" near a product name)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match prices in format "X.XX" at start of line (standalone price)
        const standalonePrice = line.match(/^(\d+)[.,](\d{2})$/);
        if (!standalonePrice) continue;

        const price = parseFloat(`${standalonePrice[1]}.${standalonePrice[2]}`);
        if (price <= 0 || price > 50) continue;

        // Skip if this price is part of an already-found deal (nearby GRATIS/KORTING)
        const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join(' ');
        if (/GRATIS|KORTING/i.test(context)) continue;

        const name = this.findProductNameAbove(lines, i);
        if (name && this.isValidProductName(name) && !seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          products.push({ name, price });
        }
      }

      // Find "NU ¤X.XX" patterns
      for (let i = 0; i < lines.length; i++) {
        const nuMatch = lines[i].match(/[¤€]\s*(\d+[.,]\d{2})/);
        if (!nuMatch) continue;

        const price = this.parsePrice(nuMatch[1]);
        if (price <= 0 || price > 50) continue;

        const name = this.findProductNameAbove(lines, i);
        if (name && this.isValidProductName(name) && !seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          products.push({ name, price });
        }
      }
    }

    // Final filter pass
    return products.filter(p => this.isValidProductName(p.name));
  }

  /**
   * Validate a parsed product name - filter out junk
   */
  private isValidProductName(name: string): boolean {
    if (!name || name.length < 4) return false;
    // Must contain at least 3 consecutive letters (real product names have words)
    if (!/[A-Za-zÀ-ÿ]{3}/.test(name)) return false;
    // Must start with a letter (not numbers, symbols)
    if (!/^[A-Za-zÀ-ÿ]/.test(name) && !/^['"']/.test(name)) return false;
    // Reject pure measurements / quantities
    if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS|PAKKEN|ROLLEN|BLIKKEN|ZAKKEN|FLESSEN|PACK)\b/i.test(name)) return false;
    if (/^\d+\s*(STUK|PAK|ZAK|POT|FLES|BOS|BLIK|TRAY)\b/i.test(name)) return false;
    // Reject dates
    if (/\d+\s*(feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec|jan)\b/i.test(name)) return false;
    // Reject lines that are just size info
    if (/^\d+[-x]\d+/i.test(name)) return false;
    if (/^[\d\s.,\-]+$/.test(name)) return false;
    // Reject bullet point lists
    if (/^[•\-]\s/.test(name)) return false;
    // Reject price-code-style names ending in single letter (like "14t", "2j")
    if (/^\d+[a-z]$/i.test(name.trim())) return false;
    // Reject unit-only / quantity-only strings
    if (/^(stuks|gram|kilo|liter|ml|cl|laags|rollen|blik|pak|zak|tray|fles)\b/i.test(name)) return false;
    // Reject marketing/UI text
    if (/^(DE BESTE|VAN NEDERLAND|VOOR DE|VERS VAN|Dagelijks|Met de|Spaar|Bij Vomar|Altijd|Schrijf|Zet-|Acties zijn|lage prijzen|Bovenop|PROFITEER|Ontdek|Lees m|BIJ\s+\d|BIJ\s+V)/i.test(name)) return false;
    // Reject "OM 100 GRAM" style junk
    if (/^OM\s+\d/i.test(name)) return false;
    // Reject fragment names starting with "of " (partial product references)
    if (/^of\s/i.test(name)) return false;
    // Reject names that are just size descriptors
    if (/^(XL|XXL|GIGA|MINI|MAXI)[-\s]*(PAK|PACK)$/i.test(name)) return false;
    // Reject single short words (Met, Zout, etc.)
    if (name.split(/\s+/).length === 1 && name.length < 5) return false;
    // Reject names that are descriptions/sentences (contain "bakken", "zorgt voor", etc.)
    if (/\b(gebakken|bakken|zorgt voor|altijd lage prijs|recepturen|slagers uit|af te)\b/i.test(name)) return false;
    // Reject names that start with descriptive verbs
    if (/^(Gevuld met|Los\.|Kruimig|Vastkokend|M\.u\.v)/i.test(name)) return false;
    // Reject container labels
    if (/^(TRAY|KRAT|BOSSEN|KRATTEN|PAKKEN)\b/i.test(name)) return false;
    // Reject "1AN", "XL-PAK" etc
    if (/^\d+[A-Z]{1,2}$/i.test(name.trim())) return false;
    // Reject "Voor X personen" patterns
    if (/Voor\s+\d+\s+personen/i.test(name)) return false;
    // Reject wine style descriptors
    if (/^(ROSÉ|FRIS|VOL)\s+[&\s]*(DROOG|FRUITIG|STEVIG)/i.test(name)) return false;
    return true;
  }

  /**
   * Look backwards from a given line index to find a product name.
   * Product names are typically 1-3 lines of text with capital letters.
   */
  private findProductNameAbove(lines: string[], idx: number): string | null {
    const nameParts: string[] = [];

    for (let i = idx - 1; i >= Math.max(0, idx - 8); i--) {
      const line = lines[i].trim();
      if (!line) continue;

      // Stop at these patterns (not part of product name)
      if (/^(PER\s|ALLE\s|TOT\s|MET\s|ZONDER|VOUCHER|ACTIE|DIEPVRIES|GRATIS|OP=OP|\d+\s*\+|\d+%|KORTING|[¤€]|\d+[.,]\d{2}$|Max\.|Alleen|Geen)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }

      // Stop at unit/quantity lines
      if (/^(STUKS|GRAM|KILO|LITER|STUK|PAK|ZAK|POT|FLES|BOS|BLIKKEN|PAKKEN|ROLLEN|FLESSEN)\b/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }

      // Skip common non-product lines
      if (/^(Dagelijks|Bovenop|Download|Prijsvoorbeeld|Alléén|Meer halen|Keuze uit|Kies|Diverse|Alle soorten|Per stuk|Per\s\d|Geschikt|Inclusief|Fles\s|Zak\s|Pak\s|Bak\s|Pot\s|Schaal\s|Net\s|Stuk\s|Heel\.|Om\sthuis|Maat\s)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }

      // Skip lines that are just measurements or dates
      if (/^\d+\s*(gram|ml|cl|liter|stuks|feb|mrt|jan|apr)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }

      // Skip price-code lines like "14t", "2j", "3p"
      if (/^\d+[a-z]$/i.test(line)) {
        continue;
      }

      // Line looks like part of a product name
      if (/[A-Za-zÀ-ÿ]/.test(line) && line.length >= 2 && line.length <= 40) {
        nameParts.unshift(line);
        if (nameParts.length >= 3) break;
      } else {
        if (nameParts.length > 0) break;
      }
    }

    if (nameParts.length === 0) return null;

    const name = nameParts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^(OP=OP|NIEUW)\s*/i, '')
      .replace(/\s+\d+[a-z]$/i, '') // Remove trailing price codes like "14t"
      .trim();

    if (!this.isValidProductName(name)) return null;

    return name;
  }

  /**
   * Parse a price string like "1.65" or "2,99"
   */
  private parsePrice(s: string): number {
    const match = s.match(/(\d+)[.,](\d{2})/);
    if (!match) return 0;
    return parseFloat(`${match[1]}.${match[2]}`);
  }

  /**
   * Search Vomar catalog API for a product to get its image
   */
  private async searchProduct(name: string): Promise<VomarSearchResult | null> {
    try {
      // Use first 2-3 meaningful words for search
      const words = name.split(/\s+/)
        .filter(w => w.length > 1 && !/^(of|en|met|in|à|de|het|een|voor|per)$/i.test(w))
        .slice(0, 3)
        .join(' ');
      if (!words) return null;

      const url = `${VOMAR_API_BASE}/article/search?searchString=${encodeURIComponent(words)}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const results = await response.json() as VomarSearchResult[];
      if (results.length === 0) return null;

      // Return the first (most relevant) result
      return results[0];
    } catch {
      return null;
    }
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const { monday, sunday } = this.getWeekDates();

    // Step 1: Get folder text from Publitas
    this.logger.info('Fetching Publitas folder data...');
    const spreads = await this.fetchSpreadsData();
    const pageTexts = this.extractPageTexts(spreads);
    this.logger.info(`Got text from ${pageTexts.length} pages`);

    // Step 2: Parse products from text
    this.logger.info('Parsing products from folder text...');
    const parsed = this.parseProducts(pageTexts);
    this.logger.success(`Parsed ${parsed.length} products from folder`);

    for (const p of parsed) {
      this.logger.debug(`  ${p.name} - €${p.price}${p.originalPrice ? ` (was €${p.originalPrice})` : ''} ${p.discountType || ''}`);
    }

    // Step 3: Enrich with images from Vomar API
    this.logger.info('Enriching products with images from Vomar API...');
    const products: ScrapedProduct[] = [];

    for (const p of parsed) {
      const apiResult = await this.searchProduct(p.name);
      let imageUrl: string | undefined;

      if (apiResult?.images?.[0]?.imageUrl) {
        imageUrl = `${VOMAR_IMAGE_CDN}/${apiResult.images[0].imageUrl}`;
      }

      products.push({
        title: p.name,
        discount_price: p.price,
        original_price: p.originalPrice,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(p.name),
        product_url: apiResult
          ? `https://www.vomar.nl/producten?articleNumber=${apiResult.articleNumber}`
          : undefined,
        image_url: imageUrl,
        unit_info: p.discountType,
      });

      // Rate limit API calls
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    this.logger.success(`Found ${products.length} deal products from Vomar folder`);
    return products;
  }
}
