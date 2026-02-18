/**
 * Vomar Scraper
 * Extracts deals from Vomar's weekly folder via Publitas embedded text.
 * Then enriches products with accurate prices from Vomar's catalog API.
 *
 * Flow:
 * 1. Load Publitas viewer in Playwright to get spreads.json (contains text per page)
 * 2. Parse product names, deal types, and folder prices from the text
 *    - Prices in folder text appear as either explicit values (e.g. "3.99")
 *      or as coded values (e.g. "3t" = €3.99) where the letter encodes cents
 * 3. Search Vomar catalog API for each product → get catalog (original) price + image
 * 4. Use folder price vs API price to determine discounts, or compute from deal type
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

const VOMAR_API_BASE = 'https://api.vomar.nl/api/v1';
const VOMAR_IMAGE_CDN = 'https://d3vricquk1sjgf.cloudfront.net/articles';

/**
 * Publitas renders Vomar folder prices as styled graphic elements.
 * The text extraction picks these up as "{euros}{letter}" codes.
 * Each letter maps to a specific cents value.
 */
const PRICE_CODE_MAP: Record<string, number> = {
  'a': 0,    // €X.- (whole euros)
  'd': 19,   // €X.19
  'f': 29,   // €X.29
  'i': 40,   // €X.40
  'j': 49,   // €X.49
  'k': 50,   // €X.50
  'p': 79,   // €X.79
  'r': 89,   // €X.89
  't': 99,   // €X.99
};

interface FolderProduct {
  name: string;
  dealType?: string;       // e.g. "1+1 GRATIS", "25% KORTING", "OP=OP"
  dealPercentage?: number; // extracted discount percentage
  folderPrice?: number;    // the deal price shown in the folder text
  isVoucherDeal?: boolean; // requires Vomar app voucher
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
   * Preprocess lines to join multi-line patterns:
   * - "1" + "+" + "1" → "1+1"
   * - "2" + "+" + "2" → "2+2"
   * - "OP" + "=" + "OP" → "OP=OP"
   * - "50%" + "KORTING" → "50% KORTING"  (or with "KO" + "RTING" etc.)
   */
  private preprocessLines(lines: string[]): string[] {
    const result: string[] = [];
    let i = 0;
    while (i < lines.length) {
      // Join "X" + "+" + "X" → "X+X"
      if (i + 2 < lines.length &&
          /^\d$/.test(lines[i]) &&
          lines[i + 1] === '+' &&
          /^\d$/.test(lines[i + 2])) {
        result.push(`${lines[i]}+${lines[i + 2]}`);
        i += 3;
        continue;
      }
      // Join "OP" + "=" + "OP" → "OP=OP"
      if (i + 2 < lines.length &&
          /^OP$/i.test(lines[i]) &&
          lines[i + 1] === '=' &&
          /^OP$/i.test(lines[i + 2])) {
        result.push('OP=OP');
        i += 3;
        continue;
      }
      // Join "XX%" + "KORTING" or lines with partial KORTING
      if (i + 1 < lines.length &&
          /\d+%$/.test(lines[i]) &&
          /^KO?RTING/i.test(lines[i + 1])) {
        result.push(`${lines[i]} KORTING`);
        i += 2;
        continue;
      }
      // Join "%\nXX" + "KORTING" pattern (like "%G\n50\nRTIN\nKO")
      // Just normalize: if line is "KORTING" or partial, keep as is
      result.push(lines[i]);
      i++;
    }
    return result;
  }

  /**
   * Decode a Publitas price code like "2t" → 2.99, "3j" → 3.49
   * Returns undefined if the code doesn't match the pattern.
   */
  private decodePriceCode(code: string): number | undefined {
    const match = code.match(/^(\d{1,2})([a-z])$/i);
    if (!match) return undefined;

    const euros = parseInt(match[1]);
    const letter = match[2].toLowerCase();
    const cents = PRICE_CODE_MAP[letter];

    if (cents === undefined) return undefined;
    return euros + cents / 100;
  }

  /**
   * Extract a price from text near a given line index.
   * Looks for explicit prices ("3.49", "2,99", "¤2.49") and
   * coded prices ("2t" = €2.99, "3j" = €3.49) within nearby lines.
   */
  private findPriceNear(lines: string[], idx: number, direction: 'above' | 'below' | 'both' = 'both'): number | undefined {
    const range = 10; // wide range — folder products have prices spread across several lines
    const startIdx = direction === 'below' ? idx : Math.max(0, idx - range);
    const endIdx = direction === 'above' ? idx : Math.min(lines.length - 1, idx + range);

    // Collect all prices found, prefer the lowest (most likely the deal price)
    const prices: number[] = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const line = lines[i].trim();

      // Match explicit "X.XX" or "X,XX" prices (with optional ¤/€ prefix)
      const explicitMatches = line.match(/[¤€]?\s*(\d+)[.,](\d{2})\b/g);
      if (explicitMatches) {
        for (const m of explicitMatches) {
          const cleaned = m.replace(/[¤€\s]/g, '').replace(',', '.');
          const val = parseFloat(cleaned);
          if (val > 0 && val < 500) prices.push(val);
        }
      }

      // Match coded prices like "2t", "3j", "14t"
      if (/^\d{1,2}[a-z]$/i.test(line)) {
        const decoded = this.decodePriceCode(line);
        if (decoded !== undefined && decoded > 0 && decoded < 500) {
          prices.push(decoded);
        }
      }
    }

    if (prices.length === 0) return undefined;
    // Return the lowest price (most likely the deal price)
    return Math.min(...prices);
  }

  /**
   * Parse products from folder text.
   * Uses multiple strategies to find as many products as possible.
   */
  private parseProducts(pages: Array<{ pageNum: number; text: string }>): FolderProduct[] {
    const products: FolderProduct[] = [];
    const seenNames = new Set<string>();

    // Dedup helper: checks both exact name and first-2-words prefix
    const isDuplicate = (name: string): boolean => {
      const lower = name.toLowerCase();
      if (seenNames.has(lower)) return true;
      const prefix = lower.split(/\s+/).slice(0, 2).join(' ');
      if (prefix.length >= 6 && seenNames.has(prefix)) return true;
      for (const seen of seenNames) {
        if (seen.startsWith(prefix) && prefix.length >= 6) return true;
      }
      return false;
    };
    const markSeen = (name: string): void => {
      seenNames.add(name.toLowerCase());
    };

    // Only skip non-product pages (contest, bedding promo, newsletter)
    const skipPages = new Set([14, 30, 39, 45]);

    // Detect voucher-only pages (contain "voucher in de Vomar-app" text)
    const voucherPages = new Set<number>();
    for (const { pageNum, text } of pages) {
      if (/voucher in de Vomar/i.test(text) || /geactiveerde\s+voucher/i.test(text)) {
        voucherPages.add(pageNum);
      }
    }

    for (const { pageNum, text } of pages) {
      if (skipPages.has(pageNum)) continue;

      const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const lines = this.preprocessLines(rawLines);
      const productCountBefore = products.length;

      // Strategy 1: Find "X+X GRATIS" deals (1+1, 2+2)
      for (let i = 0; i < lines.length; i++) {
        const isXplusX = /^\d\+\d$/.test(lines[i]);
        const isGratis = /GRATIS/i.test(lines[i]);

        if (isXplusX || isGratis) {
          let dealIdx = i;
          // If we found X+X, look for GRATIS nearby
          if (isXplusX && !isGratis) {
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
              if (/GRATIS/i.test(lines[j])) { dealIdx = j; break; }
            }
            if (!/GRATIS/i.test(lines[dealIdx])) continue;
          }

          // Extract the X+X part
          let xpx = '1+1';
          for (let j = Math.max(0, i - 2); j <= Math.min(i + 2, lines.length - 1); j++) {
            const m = lines[j].match(/(\d)\+(\d)/);
            if (m) { xpx = m[0]; break; }
          }

          const name = this.findProductNameNear(lines, Math.min(i, dealIdx));
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const pct = xpx === '2+2' ? 50 : 50; // X+X GRATIS = 50% off
            products.push({
              name,
              dealType: `${xpx} GRATIS`,
              dealPercentage: pct,
            });
          }
        }
      }

      // Strategy 2: Find "XX% KORTING" deals
      for (let i = 0; i < lines.length; i++) {
        // Check this line and neighbors for KORTING
        let hasKorting = false;
        let pct: number | undefined;

        for (let j = Math.max(0, i - 2); j <= Math.min(i + 2, lines.length - 1); j++) {
          if (/KORTING/i.test(lines[j])) hasKorting = true;
          const m = lines[j].match(/(\d+)\s*%/);
          if (m) pct = parseInt(m[1]);
        }

        if (!hasKorting || !pct || pct > 90) continue;
        // Only process this when we're at the KORTING line or % line
        if (!/KORTING/i.test(lines[i]) && !/\d+\s*%/.test(lines[i])) continue;

        const name = this.findProductNameNear(lines, i);
        if (name && !isDuplicate(name)) {
          markSeen(name);
          products.push({
            name,
            dealType: `${pct}% KORTING`,
            dealPercentage: pct,
          });
        }
      }

      // Strategy 3: Find "2e HALVE PRIJS" deals
      for (let i = 0; i < lines.length; i++) {
        if (/2e\s+HALVE\s+PRIJS|HALVE\s+PRIJS/i.test(lines[i])) {
          const name = this.findProductNameNear(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            products.push({
              name,
              dealType: '2e HALVE PRIJS',
              dealPercentage: 25,
            });
          }
        }
      }

      // Strategy 4: Find "X VOOR" combo deals
      for (let i = 0; i < lines.length; i++) {
        const comboMatch = lines[i].match(/(\d)\s+VOOR/i);
        if (!comboMatch) continue;

        const name = this.findProductNameNear(lines, i);
        if (name && !isDuplicate(name)) {
          markSeen(name);
          products.push({
            name,
            dealType: lines[i].trim(),
          });
        }
      }

      // Strategy 5: Find "OP=OP" products
      for (let i = 0; i < lines.length; i++) {
        if (/OP\s*=\s*OP/i.test(lines[i])) {
          const name = this.findProductNameNear(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const price = this.findPriceNear(lines, i);
            products.push({
              name,
              dealType: 'OP=OP',
              folderPrice: price,
            });
          }
        }
      }

      // Strategy 6: Find "VOUCHER" / "ACTIE" products
      for (let i = 0; i < lines.length; i++) {
        if (/^VOUCHER$/i.test(lines[i].trim()) || /^ACTIE$/i.test(lines[i].trim())) {
          const name = this.findProductNameNear(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const price = this.findPriceNear(lines, i);
            products.push({
              name,
              dealType: 'ACTIE',
              folderPrice: price,
            });
          }
        }
      }

      // Strategy 7: Find products with "PER STUK/PAK/ZAK/KILO" + price
      for (let i = 0; i < lines.length; i++) {
        if (/^(PER\s+(STUK|PAK|ZAK|KILO|BOS|SCHAAL|BAK|POT|FLES|SET)|(\d+)\s+(STUKS|PAKKEN|ZAKKEN|BLIKKEN|FLESSEN|BOSSEN|GRAM|KILO|LITER|ML))\b/i.test(lines[i])) {
          // Look for product name below this unit indicator
          const name = this.findProductNameBelow(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const price = this.findPriceNear(lines, i);
            products.push({
              name,
              dealType: 'AANBIEDING',
              folderPrice: price,
            });
          }
        }
      }

      // Strategy 8: Find "DIEPVRIES" section products
      for (let i = 0; i < lines.length; i++) {
        if (/^DIEPVRIES$/i.test(lines[i].trim())) {
          const name = this.findProductNameBelow(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const price = this.findPriceNear(lines, i);
            products.push({
              name,
              dealType: 'AANBIEDING',
              folderPrice: price,
            });
          }
        }
      }

      // Strategy 9: Find standalone "X STUKS" price sections (multi-buy deals)
      for (let i = 0; i < lines.length; i++) {
        if (/^\d+\s+STUKS$/i.test(lines[i].trim())) {
          const name = this.findProductNameBelow(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            const price = this.findPriceNear(lines, i);
            products.push({
              name,
              dealType: lines[i].trim(),
              folderPrice: price,
            });
          }
        }
      }

      // Strategy 10: Find products via coded price tags (e.g. "2t" = €2.99)
      // Catches products that have a Publitas price code but no explicit deal keyword
      for (let i = 0; i < lines.length; i++) {
        if (/^\d{1,2}[a-z]$/i.test(lines[i].trim())) {
          const decoded = this.decodePriceCode(lines[i].trim());
          if (decoded === undefined || decoded <= 0) continue;

          const name = this.findProductNameNear(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);
            products.push({
              name,
              dealType: 'AANBIEDING',
              folderPrice: decoded,
            });
          }
        }
      }

      // Mark all products from this page as voucher deals if it's a voucher page
      if (voucherPages.has(pageNum)) {
        const startIdx = productCountBefore;
        for (let j = startIdx; j < products.length; j++) {
          products[j].isVoucherDeal = true;
        }
      }
    }

    return products.filter(p => this.isValidProductName(p.name));
  }

  /**
   * Validate a parsed product name - filter out junk
   */
  private isValidProductName(name: string): boolean {
    if (!name || name.length < 4) return false;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(name)) return false;
    if (!/^[A-Za-zÀ-ÿ'"]/.test(name)) return false;
    if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS|PAKKEN|ROLLEN|BLIKKEN|ZAKKEN|FLESSEN|PACK)\b/i.test(name)) return false;
    if (/^\d+\s*(STUK|PAK|ZAK|POT|FLES|BOS|BLIK|TRAY)\b/i.test(name)) return false;
    if (/\d+\s*(feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec|jan)\b/i.test(name)) return false;
    if (/^\d+[-x]\d+/i.test(name)) return false;
    if (/^[\d\s.,\-]+$/.test(name)) return false;
    if (/^[•\-]\s/.test(name)) return false;
    if (/^\d+[a-z]$/i.test(name.trim())) return false;
    if (/^(stuks|gram|kilo|liter|ml|cl|laags|rollen|blik|pak|zak|tray|fles)\b/i.test(name)) return false;
    if (/^(DE BESTE|VAN NEDERLAND|VOOR DE|VERS VAN|Dagelijks|Met de|Spaar|Bij Vomar|Altijd|Schrijf|Zet-|Acties zijn|lage prijzen|Bovenop|PROFITEER|Ontdek|Lees m|BIJ\s+\d|BIJ\s+V|TOT\s+\d|Prijsvoorbeeld|Download|Vomar-app|Meer halen|Penn\s|Rodi\s|Vaste\b|Kies\s.*Mix|Bos\s+\d+\s+stelen|Verse buitenlandse|Last minute|ACTIVEER|Versgesneden|Scharreleieren)/i.test(name)) return false;
    if (/Hotelkadetten/i.test(name)) return false;
    if (/^OM\s+\d/i.test(name)) return false;
    if (/^of\s/i.test(name)) return false;
    if (/^(XL|XXL|GIGA|MINI|MAXI)[-\s]*(PAK|PACK)$/i.test(name)) return false;
    if (name.split(/\s+/).length === 1 && name.length < 5) return false;
    if (/\b(gebakken|bakken|zorgt voor|altijd lage prijs|recepturen|slagers uit|af te)\b/i.test(name)) return false;
    if (/^(Gevuld met|Los\.|Kruimig|Vastkokend|M\.u\.v)/i.test(name)) return false;
    if (/^(TRAY|KRAT|BOSSEN|KRATTEN|PAKKEN)\b/i.test(name)) return false;
    if (/^\d+[A-Z]{1,2}$/i.test(name.trim())) return false;
    if (/Voor\s+\d+\s+personen/i.test(name)) return false;
    if (/^(ROSÉ|FRIS|VOL)\s+[&\s]*(DROOG|FRUITIG|STEVIG)/i.test(name)) return false;
    if (/^(Keuze uit|Wit of|Maat\s|Maten\s|Kleur|Materiaal|Afmeting|Inclusief|Werkt op)/i.test(name)) return false;
    if (/^(Snijplanken|Stoffer|Kledinghangers|Boxershorts|Sokken|Puzzel|Ledlamp|Wandklok|Opbergpoef|Bakgerei|Siliconen)/i.test(name)) return false;
    if (/^(Verdeelstekker|Pluche|Boomstammen|Scharenset|Afwasborstels|Nexxt|Bison|Organizer|Gootsteen|Decoratieve)/i.test(name)) return false;
    if (/k\s+n\s+a\s+l\s+le/i.test(name)) return false;  // garbled "knaller" text
    if (/DONDER|VRIJDA|ZONDA/i.test(name) && /r!G|rG|r!/i.test(name)) return false;  // garbled day names
    if (/•/.test(name)) return false;  // bullet lists are variant descriptions, not products
    if (name.length > 45) return false;  // overly long names are descriptions, not product names
    if (/\b(gemaakt in onze|wijze gemaakt|ingekocht voor)\b/i.test(name)) return false;  // description text
    if (/^Pluche\s/i.test(name)) return false;
    return true;
  }

  /**
   * Look for a product name near a given line index.
   * Searches ABOVE first, then BELOW if nothing found above.
   */
  private findProductNameNear(lines: string[], idx: number): string | null {
    // Try above first
    const above = this.findProductNameAbove(lines, idx);
    if (above) return above;
    // Try below
    return this.findProductNameBelow(lines, idx);
  }

  /**
   * Look backwards from a given line index to find a product name.
   */
  private findProductNameAbove(lines: string[], idx: number): string | null {
    const nameParts: string[] = [];

    for (let i = idx - 1; i >= Math.max(0, idx - 10); i--) {
      const line = lines[i].trim();
      if (!line) continue;

      // Stop markers
      if (/^(PER\s|ALLE\s|TOT\s|MET\s|ZONDER|VOUCHER|ACTIE|DIEPVRIES|GRATIS|OP=OP|\d+\+\d|KORTING|[¤€]|\d+[.,]\d{2}$|Max\.|Alleen|Geen|Adviesprijs)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^(STUKS|GRAM|KILO|LITER|STUK|PAK|ZAK|POT|FLES|BOS|BLIKKEN|PAKKEN|ROLLEN|FLESSEN)\b/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^(Dagelijks|Bovenop|Download|Prijsvoorbeeld|Alléén|Meer halen|Keuze uit|Kies|Diverse|Alle soorten|Per stuk|Per\s\d|Geschikt|Inclusief|Fles\s|Zak\s|Pak\s|Bak\s|Pot\s|Schaal\s|Net\s|Stuk\s|Heel\.|Om\sthuis|Maat\s|Maten\s)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d+\s*(gram|ml|cl|liter|stuks|feb|mrt|jan|apr|mei|jun|jul|aug|sep|okt|nov|dec)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d{1,2}[a-z]$/i.test(line)) { // price codes like "14t", "2t"
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d+[.,]\d{2}\s*-\s*\d+[.,]\d{2}$/.test(line)) {
        if (nameParts.length > 0) break;
        continue; // price ranges
      }
      if (/^[\d.,\-\s]+$/.test(line) && line.length < 10) {
        if (nameParts.length > 0) break;
        continue; // pure numbers
      }

      // Line looks like part of a product name
      if (/[A-Za-zÀ-ÿ]/.test(line) && line.length >= 2 && line.length <= 50) {
        nameParts.unshift(line);
        if (nameParts.length >= 3) break;
      } else {
        if (nameParts.length > 0) break;
      }
    }

    return this.cleanProductName(nameParts);
  }

  /**
   * Look forward from a given line index to find a product name.
   */
  private findProductNameBelow(lines: string[], idx: number): string | null {
    const nameParts: string[] = [];

    for (let i = idx + 1; i < Math.min(lines.length, idx + 10); i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip non-name lines (break if we already have name parts)
      if (/^(PER\s|ALLE\s|TOT\s|MET\s|ZONDER|VOUCHER|ACTIE|GRATIS|OP=OP|\d+\+\d|KORTING|[¤€]|Max\.|Alleen|Geen|Adviesprijs)/i.test(line)) continue;
      if (/^[\d.,\-\s]+$/.test(line) && line.length < 10) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d{1,2}[a-z]$/i.test(line)) { // coded prices like "2t", "14t"
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d+[.,]\d{2}\s*-\s*\d+[.,]\d{2}$/.test(line)) continue;
      if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS|PAKKEN)\b/i.test(line)) continue;
      if (/^(STUKS|GRAM|KILO|LITER)\b/i.test(line)) continue;

      // Stop at description/detail lines once we have a name
      if (nameParts.length > 0 && /^(Alle soorten|Keuze uit|Per stuk|Per\s\d|Pak\s|Fles\s|Zak\s|Bak\s|Pot\s|Schaal\s|Stuk\s|Los\.|Diverse)/i.test(line)) break;

      // Looks like a product name
      if (/[A-Za-zÀ-ÿ]/.test(line) && line.length >= 2 && line.length <= 50) {
        nameParts.push(line);
        if (nameParts.length >= 3) break;
      } else {
        if (nameParts.length > 0) break;
      }
    }

    return this.cleanProductName(nameParts);
  }

  /**
   * Clean and validate name parts into a product name
   */
  private cleanProductName(nameParts: string[]): string | null {
    if (nameParts.length === 0) return null;

    const name = nameParts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^(OP=OP|NIEUW|DIEPVRIES)\s*/i, '')
      .replace(/\s+\d+[a-z]$/i, '')
      .replace(/\s+(of|en|met)\s*$/i, '')  // trim trailing conjunctions
      .trim();

    if (!this.isValidProductName(name)) return null;
    return name;
  }

  /**
   * Check if an API result matches the folder product name.
   * The first significant word (brand name) must appear in the API text,
   * OR at least 2 significant words must match.
   * This prevents false matches like "Firat Turkse Pizza" → "MELKAN TURKSE YOGHURT".
   */
  private isApiResultMatch(folderName: string, result: VomarSearchResult): boolean {
    const apiText = `${result.brand || ''} ${result.description}`.toLowerCase();
    const folderWords = folderName.split(/\s+/)
      .map(w => w.toLowerCase().replace(/[^a-zà-ÿ]/g, ''))
      .filter(w => w.length >= 4);

    if (folderWords.length === 0) return false;

    // First word (brand name) match is a strong signal
    if (apiText.includes(folderWords[0])) return true;

    // Alternatively, if 2+ words match, it's a good match
    const matchCount = folderWords.filter(w => apiText.includes(w)).length;
    return matchCount >= 2;
  }

  /**
   * Search Vomar catalog API for a product to get its price and image.
   * Tries the first 3 words, then first 2 words if that fails.
   * Validates that the result actually matches the folder product name.
   */
  private async searchProduct(name: string): Promise<VomarSearchResult | null> {
    const stopWords = new Set(['of', 'en', 'met', 'in', 'à', 'de', 'het', 'een', 'voor', 'per', 'op', 'uit', 'bij']);
    const words = name.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));

    const attempts: string[] = [];
    if (words.length > 0) attempts.push(words.slice(0, 3).join(' '));
    if (words.length > 1) attempts.push(words.slice(0, 2).join(' '));
    // Try first word alone only if it looks like a brand (5+ chars, starts with uppercase)
    if (words.length > 0 && words[0].length >= 5 && /^[A-ZÀ-Ý]/.test(words[0])) {
      attempts.push(words[0]);
    }

    for (const query of attempts) {
      try {
        const url = `${VOMAR_API_BASE}/article/search?searchString=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const results = await response.json() as VomarSearchResult[];
        if (results.length > 0 && this.isApiResultMatch(name, results[0])) {
          return results[0];
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const { monday, sunday } = this.getWeekDates();

    // Step 1: Get folder text from Publitas
    this.logger.info('Fetching Publitas folder data...');
    const spreads = await this.fetchSpreadsData();
    const pageTexts = this.extractPageTexts(spreads);
    this.logger.info(`Got text from ${pageTexts.length} pages`);

    // Step 2: Parse products from text
    this.logger.info('Parsing products from folder...');
    const parsed = this.parseProducts(pageTexts);
    this.logger.success(`Found ${parsed.length} products in folder`);

    for (const p of parsed) {
      this.logger.debug(`  ${p.name} [${p.dealType || 'no deal'}] ${p.folderPrice ? '€' + p.folderPrice : ''}`);
    }

    // Step 3: Enrich with prices and images from Vomar API
    this.logger.info('Fetching catalog prices and images from Vomar API...');
    const products: ScrapedProduct[] = [];
    let apiHits = 0;
    let apiMisses = 0;

    for (const p of parsed) {
      const apiResult = await this.searchProduct(p.name);

      let discountPrice: number;
      let originalPrice: number | undefined;
      let discountPercentage: number | undefined;
      let title: string;
      let imageUrl: string | undefined;
      let productUrl: string | undefined;

      if (apiResult) {
        apiHits++;
        const catalogPrice = apiResult.price; // API returns euros

        if (apiResult.images?.[0]?.imageUrl) {
          imageUrl = `${VOMAR_IMAGE_CDN}/${apiResult.images[0].imageUrl}`;
        }

        if (p.dealPercentage && p.dealPercentage > 0) {
          // Known percentage deal (1+1 GRATIS = 50%, XX% KORTING, 2e HALVE PRIJS = 25%)
          originalPrice = catalogPrice;
          discountPrice = Math.round(catalogPrice * (1 - p.dealPercentage / 100) * 100) / 100;
          discountPercentage = p.dealPercentage;
        } else if (p.folderPrice && p.folderPrice < catalogPrice) {
          // Folder shows a lower price than catalog → real discount
          discountPrice = p.folderPrice;
          originalPrice = catalogPrice;
          discountPercentage = Math.round((1 - p.folderPrice / catalogPrice) * 100);
        } else {
          // OP=OP, AANBIEDING, ACTIE — show at catalog price with deal label
          discountPrice = catalogPrice;
        }

        title = apiResult.brand
          ? `${apiResult.brand} ${apiResult.description}`
          : apiResult.description;
        productUrl = `https://www.vomar.nl/producten?articleNumber=${apiResult.articleNumber}`;
      } else {
        apiMisses++;

        // No API match — include if we have a folder price (explicit or decoded)
        if (!p.folderPrice) {
          this.logger.debug(`  No API match and no folder price for: ${p.name}`);
          continue;
        }

        discountPrice = p.folderPrice;
        title = p.name;
        this.logger.debug(`  No API match, using folder price: ${p.name} → €${p.folderPrice}`);
      }

      products.push({
        title,
        discount_price: discountPrice,
        original_price: originalPrice,
        discount_percentage: discountPercentage,
        unit_info: p.isVoucherDeal
          ? (p.dealType?.includes('Vomar app') ? p.dealType : `${p.dealType || 'ACTIE'} (Vomar app)`)
          : p.dealType,
        valid_from: monday,
        valid_until: sunday,
        category_slug: this.detectCategory(title),
        product_url: productUrl,
        image_url: imageUrl,
      });

      this.logger.debug(`  ${title} — €${discountPrice}${originalPrice ? ` (was €${originalPrice})` : ''} [${p.dealType || ''}]`);

      // Rate limit API calls
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info(`API matches: ${apiHits}/${parsed.length} (${apiMisses} missed)`);
    this.logger.success(`Found ${products.length} deal products from Vomar folder`);
    return products;
  }
}
