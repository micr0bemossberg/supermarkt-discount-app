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
  'b': 9,    // €X.09
  'c': 15,   // €X.15
  'd': 19,   // €X.19
  'e': 25,   // €X.25
  'f': 29,   // €X.29
  'g': 35,   // €X.35
  'h': 39,   // €X.39
  'i': 40,   // €X.40
  'j': 49,   // €X.49
  'k': 50,   // €X.50
  'l': 55,   // €X.55
  'm': 59,   // €X.59
  'n': 65,   // €X.65
  'o': 69,   // €X.69
  'p': 79,   // €X.79
  'q': 85,   // €X.85
  'r': 89,   // €X.89
  's': 95,   // €X.95
  't': 99,   // €X.99
};

interface FolderProduct {
  name: string;
  dealType?: string;       // e.g. "1+1 GRATIS", "25% KORTING", "OP=OP"
  dealPercentage?: number; // extracted discount percentage
  folderPrice?: number;    // the deal price shown in the folder text
  isVoucherDeal?: boolean; // requires Vomar app voucher
  comboCount?: number;     // for "3 VOOR 8" → comboCount = 3
  comboPrice?: number;     // for "3 VOOR 8" → comboPrice = 8
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
   * Fetch spreads.json from a Publitas viewer URL via Playwright
   */
  private async fetchSpreadsData(publitasUrl: string, label: string): Promise<any[]> {
    const page = await this.initBrowser();

    return new Promise(async (resolve, reject) => {
      let spreadsData: any = null;

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('spreads.json')) {
          try {
            spreadsData = await response.json();
            this.logger.success(`Got ${label} spreads.json with ${Array.isArray(spreadsData) ? spreadsData.length : Object.keys(spreadsData).length} entries`);
          } catch (e) {
            this.logger.warning(`Failed to parse ${label} spreads.json`);
          }
        }
      });

      try {
        this.logger.info(`Loading ${label} Publitas viewer...`);
        await page.goto(publitasUrl, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await page.waitForTimeout(3000);

        if (!spreadsData) {
          reject(new Error(`Failed to capture spreads.json from ${label}`));
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
      // Join "O=P" + "OP" → "OP=OP" (alternate Publitas text extraction)
      if (i + 1 < lines.length &&
          /^O=P$/i.test(lines[i]) &&
          /^OP$/i.test(lines[i + 1])) {
        result.push('OP=OP');
        i += 2;
        continue;
      }
      // Join "N" + "STUKS/ZAKKEN/PAKKEN" → "N STUKS" (often split across lines)
      if (i + 1 < lines.length &&
          /^\d{1,2}$/.test(lines[i]) &&
          /^(STUKS|ZAKKEN|PAKKEN|BLIKKEN|FLESSEN|ROLLEN)$/i.test(lines[i + 1])) {
        result.push(`${lines[i]} ${lines[i + 1]}`);
        i += 2;
        continue;
      }
      // Join garbled KORTING: "%" + "0" + "5" → "50%" (then next pass catches KORTING)
      // Also: "%" + digit + digit → percentage
      if (i + 2 < lines.length &&
          lines[i] === '%' &&
          /^\d$/.test(lines[i + 1]) &&
          /^\d$/.test(lines[i + 2])) {
        result.push(`${lines[i + 2]}${lines[i + 1]}%`);
        i += 3;
        continue;
      }
      // Normalize "X.-" prices to "X.00" (e.g. "8.-" → "8.00", "3.-" → "3.00")
      if (/^\d{1,2}\.-$/.test(lines[i])) {
        result.push(lines[i].replace('.-', '.00'));
        i++;
        continue;
      }
      // Normalize "X .-" prices (with space)
      if (/^\d{1,2}\s+\.-$/.test(lines[i])) {
        result.push(lines[i].replace(/\s+\.-$/, '.00'));
        i++;
        continue;
      }
      // Normalize "X .XX" prices (space before decimal, e.g. "2 .29" → "2.29")
      if (/^\d{1,2}\s+\.\d{2}$/.test(lines[i])) {
        result.push(lines[i].replace(/\s+\./, '.'));
        i++;
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
      // Also handle truncated prices like "¤4.9" (1 decimal digit from Publitas)
      const explicitMatches = line.match(/[¤€]?\s*(\d+)[.,](\d{1,2})\b/g);
      if (explicitMatches) {
        for (const m of explicitMatches) {
          const cleaned = m.replace(/[¤€\s]/g, '').replace(',', '.');
          const val = parseFloat(cleaned);
          if (val > 0 && val < 500) prices.push(val);
        }
      }

      // Match "X.-" format (whole euros, e.g. "8.-" = €8.00, "3.-" = €3.00)
      const wholePriceMatch = line.match(/^[¤€]?\s*(\d{1,2})\s*\.-$/);
      if (wholePriceMatch) {
        const val = parseInt(wholePriceMatch[1]);
        if (val > 0 && val < 500) prices.push(val);
      }

      // Match "¤X.XX ProductName" (price + product on same line)
      const priceNameMatch = line.match(/^[¤€]\s*(\d+)[.,](\d{1,2})\s+\S/);
      if (priceNameMatch) {
        const val = parseFloat(`${priceNameMatch[1]}.${priceNameMatch[2].padEnd(2, '0')}`);
        if (val > 0 && val < 500) prices.push(val);
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
   * Specialized parser for the dagknaller page.
   * The dagknaller page has a known structure: 7 daily "Vaste dagacties"
   * each preceded by OP=OP marker with garbled day name text.
   * Pattern: OP=OP → product name → description → unit info → original price → deal price code
   */
  private parseDagknallerProducts(pages: Array<{ pageNum: number; text: string }>): FolderProduct[] {
    const products: FolderProduct[] = [];
    const seenNames = new Set<string>();

    for (const { text } of pages) {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Find all OP=OP markers
      for (let i = 0; i < lines.length; i++) {
        if (!/^OP\s*=\s*OP$/i.test(lines[i])) continue;

        // Collect product name lines BELOW, plus price info
        const nameParts: string[] = [];
        let priceCode: number | undefined;
        let originalPrice: number | undefined;

        for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
          const line = lines[j];
          if (!line) continue;

          // Stop at next OP=OP or "Vaste" (next day section)
          if (/^OP\s*=\s*OP$/i.test(line)) break;
          if (/^Vaste$/i.test(line)) break;

          // Price code (e.g. "0t" = €0.99, "3j" = €3.49)
          if (/^\d{1,2}[a-z]$/i.test(line)) {
            const decoded = this.decodePriceCode(line);
            if (decoded !== undefined) {
              // If we don't have a price yet, this is the deal price
              // If we already have one, this might be the original price of the NEXT product
              if (!priceCode) {
                priceCode = decoded;
              }
            }
            continue;
          }

          // Explicit price (original price, e.g. "1.49", "4.99")
          if (/^\d+[.,]\d{2}$/.test(line)) {
            originalPrice = parseFloat(line.replace(',', '.'));
            continue;
          }

          // Price range (e.g. "8.69 - 9.99") - take the higher end
          if (/^\d+[.,]\d{2}\s*-\s*\d+[.,]\d{2}$/.test(line)) {
            const parts = line.split('-').map(p => parseFloat(p.trim().replace(',', '.')));
            originalPrice = Math.max(...parts);
            continue;
          }

          // Skip unit/quantity info
          if (/^(ZAK|TRAY|PAK|DOOS|BOS|SCHAAL|BAK|POT|FLES|SET|PER\s)/i.test(line)) continue;
          if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS)/i.test(line)) continue;
          if (/^Max\./i.test(line)) continue;

          // Skip description/variant lines
          if (/^(Jong,|Belegen|Extra\s+Belegen|Stuk\s|Maat\s|Emmer\s|Ongezouten|Rol\s|Om\s)/i.test(line)) continue;

          // Skip garbled day names and dagknaller decorative text
          if (/knall/i.test(line)) continue;
          if (/^(MAAND|DINSD|WOENS|DONDER|VRIJDA|ZATERD|ZONDA)/i.test(line)) continue;
          if (/^k\s+n\s+a\s+l/i.test(line)) continue;
          if (/^(VOORDEELSTUK|PER KILO|!$|r!G$|r!$)/i.test(line)) continue;
          if (/^(Ni|eu|w!)$/i.test(line)) continue;
          if (/^(Dat is|Alle scherpe|dezelfde|terug|pakken|voordeel|komen elke)/i.test(line)) continue;
          if (/^(goedkop|Vomar|kansatlel|dagac)/i.test(line)) continue;

          // Price comparison table data (from page 25/26)
          if (/^\d+[.,]\d{2}$/.test(line)) continue;
          if (/^(EUR|JUMBO|ALBERT|PICNIC|AH\s|LIDL|PLUS)/i.test(line)) continue;
          if (/\d{1,2}-\d{1,2}-\d{4}/.test(line)) continue;
          if (/^[A-Z\s]+\d+\s*(GRAM|ML|STUKS|LITER)/i.test(line) && line.length > 30) continue;

          // This looks like a product name
          if (/[A-Za-zÀ-ÿ]/.test(line) && line.length >= 3 && line.length <= 40) {
            // Only collect 1-2 name lines (dagknaller products have short names)
            if (nameParts.length < 2) {
              nameParts.push(line);
            } else if (nameParts.length === 2) {
              break; // We have enough name parts
            }
          }
        }

        if (nameParts.length > 0 && priceCode !== undefined) {
          const name = nameParts.join(' ').replace(/\s+/g, ' ').trim();
          if (name.length >= 4 && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            products.push({
              name,
              dealType: 'OP=OP',
              folderPrice: priceCode,
              ...(originalPrice ? {} : {}),
            });
            this.logger.debug(`  Dagknaller: ${name} → €${priceCode}${originalPrice ? ` (was €${originalPrice})` : ''}`);
          }
        }
      }
    }

    return products;
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

    // Dynamically detect non-product pages (contest, newsletter, etc.) from content
    const skipPages = new Set<number>();
    for (const { pageNum, text } of pages) {
      if (/spelvoorwaarden/i.test(text) && /win\s/i.test(text)) skipPages.add(pageNum);
      if (/nieuwsbrief/i.test(text) && text.length < 500) skipPages.add(pageNum);
      // Price comparison pages (Vomar vs Albert Heijn vs Jumbo etc.)
      if (/Concurrentieprijzen/i.test(text) && /ALBERT\s+HEIJN/i.test(text)) skipPages.add(pageNum);
      // Alternative price comparison format: "prijzen zijn ... geverifieerd" + multiple supermarket names
      if (/prijzen\s+zijn.*geverifieerd/i.test(text) && /ALBERT\s+HEIJN/i.test(text) && /JUMBO/i.test(text)) skipPages.add(pageNum);
      // Pages with VOMAR + multiple competitor names in close proximity (price comparison tables)
      const supermarketMentions = (text.match(/\b(ALBERT HEIJN|JUMBO|PICNIC)\b/gi) || []).length;
      if (supermarketMentions >= 4 && /VOMAR/i.test(text)) skipPages.add(pageNum);
    }
    this.logger.debug(`Skipping pages: ${[...skipPages].join(', ') || 'none'}`);

    // Detect voucher-only pages (contain "voucher in de Vomar-app" text)
    const voucherPages = new Set<number>();
    for (const { pageNum, text } of pages) {
      if (/voucher/i.test(text) && (/vomar/i.test(text) || /app/i.test(text) || /activeer/i.test(text))) {
        voucherPages.add(pageNum);
      }
    }
    this.logger.debug(`Voucher pages: ${[...voucherPages].join(', ') || 'none'}`);

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

      // Strategy 4: Find "X VOOR Y" combo deals (e.g. "3 VOOR 8", "2 VOOR 4,99")
      for (let i = 0; i < lines.length; i++) {
        const comboMatch = lines[i].match(/(\d)\s+VOOR/i);
        if (!comboMatch) continue;

        const comboCount = parseInt(comboMatch[1]);

        // Try to extract the combo price from the same line
        let comboPrice: number | undefined;
        const sameLinePrice = lines[i].match(/VOOR\s+[¤€]?\s*(\d+)[.,]?(\d{0,2})/i);
        if (sameLinePrice) {
          const euros = parseInt(sameLinePrice[1]);
          const cents = sameLinePrice[2] ? parseInt(sameLinePrice[2].padEnd(2, '0')) : 0;
          comboPrice = euros + cents / 100;
        }

        // If not on same line, look below for a price (coded or explicit)
        if (!comboPrice) {
          for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
            // Coded price like "8a" = €8.00
            if (/^\d{1,2}[a-z]$/i.test(lines[j])) {
              comboPrice = this.decodePriceCode(lines[j]);
              if (comboPrice) break;
            }
            // Explicit price like "8.00" or "4,99"
            const explMatch = lines[j].match(/^[¤€]?\s*(\d+)[.,](\d{1,2})$/);
            if (explMatch) {
              comboPrice = parseFloat(`${explMatch[1]}.${explMatch[2].padEnd(2, '0')}`);
              break;
            }
            // Whole number price like "8" (for "3 VOOR 8")
            if (/^\d{1,2}$/.test(lines[j]) && parseInt(lines[j]) > 0) {
              comboPrice = parseInt(lines[j]);
              break;
            }
          }
        }

        const name = this.findProductNameNear(lines, i);
        if (name && !isDuplicate(name)) {
          markSeen(name);
          const perItemPrice = comboPrice ? Math.round(comboPrice / comboCount * 100) / 100 : undefined;
          products.push({
            name,
            dealType: comboPrice ? `${comboCount} VOOR €${comboPrice.toFixed(2)}` : `${comboCount} VOOR`,
            folderPrice: perItemPrice,
            comboCount,
            comboPrice,
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
      // Also detect "Met voucher" / "Zonder voucher" pricing pattern
      for (let i = 0; i < lines.length; i++) {
        const isVoucher = /^VOUCHER$/i.test(lines[i].trim());
        const isActie = /^ACTIE$/i.test(lines[i].trim());
        if (isVoucher || isActie) {
          // Check if VOUCHER appears nearby (indicates voucher-required deal)
          let hasVoucher = isVoucher;
          if (!hasVoucher) {
            for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
              if (/^VOUCHER$/i.test(lines[j].trim())) { hasVoucher = true; break; }
            }
          }
          const name = this.findProductNameNear(lines, i);
          if (name && !isDuplicate(name)) {
            markSeen(name);

            // For voucher deals, look for "Met voucher" / "Zonder voucher" pricing pattern
            // Pattern: "Zonder voucher" → price (original), "Met voucher" → price (deal)
            let voucherPrice: number | undefined;
            let originalVoucherPrice: number | undefined;
            if (hasVoucher) {
              for (let j = i; j < Math.min(lines.length, i + 25); j++) {
                if (/^Met$/i.test(lines[j]) && j + 1 < lines.length && /^voucher$/i.test(lines[j + 1])) {
                  // Look for coded price or explicit price after "Met voucher"
                  for (let k = j + 2; k < Math.min(lines.length, j + 5); k++) {
                    if (/^\d{1,2}[a-z]$/i.test(lines[k])) {
                      voucherPrice = this.decodePriceCode(lines[k]);
                      break;
                    }
                    const priceMatch = lines[k].match(/^[¤€]?\s*(\d+)[.,](\d{1,2})$/);
                    if (priceMatch) {
                      voucherPrice = parseFloat(lines[k].replace(/[¤€\s]/g, '').replace(',', '.'));
                      break;
                    }
                  }
                }
                if (/^Zonder$/i.test(lines[j]) && j + 1 < lines.length && /^voucher$/i.test(lines[j + 1])) {
                  for (let k = j + 2; k < Math.min(lines.length, j + 5); k++) {
                    if (/^\d{1,2}[a-z]$/i.test(lines[k])) {
                      originalVoucherPrice = this.decodePriceCode(lines[k]);
                      break;
                    }
                    const priceMatch = lines[k].match(/^[¤€]?\s*(\d+)[.,](\d{1,2})$/);
                    if (priceMatch) {
                      originalVoucherPrice = parseFloat(lines[k].replace(/[¤€\s]/g, '').replace(',', '.'));
                      break;
                    }
                  }
                }
              }
            }

            const price = voucherPrice || this.findPriceNear(lines, i);
            const product: FolderProduct = {
              name,
              dealType: 'ACTIE',
              folderPrice: price,
              isVoucherDeal: hasVoucher,
            };
            // If we found both voucher prices, calculate discount percentage
            if (voucherPrice && originalVoucherPrice && originalVoucherPrice > voucherPrice) {
              product.dealPercentage = Math.round((1 - voucherPrice / originalVoucherPrice) * 100);
            }
            products.push(product);
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

      // Strategy 10b: Find "¤X.XX ProductName" (price + product on same line)
      // e.g. "¤3.00 Klene Drop" or "¤1.69 Spa Fruit"
      for (let i = 0; i < lines.length; i++) {
        const priceNameMatch = lines[i].match(/^[¤€]\s*(\d+)[.,](\d{1,2})\s+(.+)/);
        if (!priceNameMatch) continue;

        const price = parseFloat(`${priceNameMatch[1]}.${priceNameMatch[2].padEnd(2, '0')}`);
        const candidateName = priceNameMatch[3].trim();
        if (price <= 0 || price >= 50) continue;

        if (candidateName.length >= 4 && this.isValidProductName(candidateName) && !isDuplicate(candidateName)) {
          markSeen(candidateName);
          products.push({
            name: candidateName,
            dealType: voucherPages.has(pageNum) ? 'ACTIE' : 'AANBIEDING',
            folderPrice: price,
            isVoucherDeal: voucherPages.has(pageNum),
          });
        }
      }

      // Strategy 11: Catch-all — find products near explicit prices (no deal keyword needed)
      // In the Vomar folder, EVERY page contains deals. Products may just have
      // a name and a price without "1+1 GRATIS" or "KORTING" keywords.
      for (let i = 0; i < lines.length; i++) {
        // Match explicit prices like "1.69", "2,49", "¤3.99"
        const explPriceMatch = lines[i].match(/^[¤€]?\s*(\d+)[.,](\d{1,2})$/);
        if (!explPriceMatch) continue;

        const price = parseFloat(`${explPriceMatch[1]}.${explPriceMatch[2].padEnd(2, '0')}`);
        if (price <= 0 || price >= 50) continue;

        // Find product name above this price (in folders, names are typically above prices)
        const name = this.findProductNameAbove(lines, i);
        if (name && !isDuplicate(name)) {
          markSeen(name);
          products.push({
            name,
            dealType: voucherPages.has(pageNum) ? 'ACTIE' : 'AANBIEDING',
            folderPrice: price,
            isVoucherDeal: voucherPages.has(pageNum),
          });
        }
      }

      // Strategy 12: Voucher page sweep — on voucher pages, also look below prices
      // to catch products that have price ABOVE the name (less common layout)
      if (voucherPages.has(pageNum)) {
        for (let i = 0; i < lines.length; i++) {
          // Check for coded prices
          if (/^\d{1,2}[a-z]$/i.test(lines[i])) {
            const decoded = this.decodePriceCode(lines[i]);
            if (!decoded || decoded <= 0) continue;

            // Try below (already tried above in Strategy 10)
            const nameBelow = this.findProductNameBelow(lines, i);
            if (nameBelow && !isDuplicate(nameBelow)) {
              markSeen(nameBelow);
              products.push({
                name: nameBelow,
                dealType: 'ACTIE',
                folderPrice: decoded,
                isVoucherDeal: true,
              });
            }
          }

          // Check for explicit prices
          const explMatch = lines[i].match(/^[¤€]?\s*(\d+)[.,](\d{1,2})$/);
          if (explMatch) {
            const price = parseFloat(`${explMatch[1]}.${explMatch[2].padEnd(2, '0')}`);
            if (price <= 0 || price >= 50) continue;

            const nameBelow = this.findProductNameBelow(lines, i);
            if (nameBelow && !isDuplicate(nameBelow)) {
              markSeen(nameBelow);
              products.push({
                name: nameBelow,
                dealType: 'ACTIE',
                folderPrice: price,
                isVoucherDeal: true,
              });
            }
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

      this.logger.debug(`Page ${pageNum}: found ${products.length - productCountBefore} products`);
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
    // Quantity + unit at start (with possible trailing chars like "6 KILO9")
    if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS|PAKKEN|ROLLEN|BLIKKEN|ZAKKEN|FLESSEN|PACK)/i.test(name)) return false;
    if (/^\d+\s*(STUK|PAK|ZAK|POT|FLES|BOS|BLIK|TRAY)/i.test(name)) return false;
    if (/\d+\s*(feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec|jan)\b/i.test(name)) return false;
    if (/^\d+[-x]\d+/i.test(name)) return false;
    if (/^[\d\s.,\-]+$/.test(name)) return false;
    if (/^[•\-]\s/.test(name)) return false;
    if (/^\d+[a-z]$/i.test(name.trim())) return false;
    if (/^(stuks|gram|kilo|liter|ml|cl|laags|rollen|blik|pak|zak|tray|fles)\b/i.test(name)) return false;
    // Promotional / informational text
    if (/^(DE BESTE|VAN NEDERLAND|VOOR DE|VERS VAN|Dagelijks|Met de|Spaar|Bij Vomar|Altijd|Schrijf|Zet-|Acties zijn|lage prijzen|Bovenop|PROFITEER|Ontdek|Lees m|BIJ\s+\d|BIJ\s+V|TOT\s+\d|Prijsvoorbeeld|Download|Vomar-app|Meer halen|Penn\s|Rodi\s|Vaste\b|Kies\s.*Mix|Bos\s+\d+\s+stelen|Verse buitenlandse|Last minute|ACTIVEER|Versgesneden|Scharreleieren|Pr\s*ijs\s*door|Concurrentieprijzen|Prijzen zijn)/i.test(name)) return false;
    // Price comparison sections (Bij Mediamarkt, Bij Bol.com, Bij Kruidvat, etc.)
    if (/^Bij\s/i.test(name)) return false;
    if (/\bBij\s+(Mediamarkt|Bol\.com|Kruidvat|Amazon|Coolblue|Blokker|HEMA|Praxis|Gamma|Karwei)/i.test(name)) return false;
    if (/Mediamarkt|Bol\.com|Kruidvat\.nl|Amazon\.nl/i.test(name)) return false;
    // Customer limit text
    if (/perklant|per\s*klant/i.test(name)) return false;
    // Garbled OP=OP fragments
    if (/^O=P\s/i.test(name)) return false;
    if (/^OP\s*=\s*OP$/i.test(name)) return false;
    // Hotelkadetten is a real product (bread rolls), NOT filtered
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
    // Names that are just "klant" fragments or garbled text
    if (/^(klant|perklant)\b/i.test(name)) return false;
    if (/^[A-Z]=[A-Z]\s/i.test(name) && name.length < 15) return false; // "O=P OP..." type garbage (must have = sign)
    // Garbled day names with "knall" (dagknaller text corruption)
    if (/knall\b/i.test(name) && !/knaller/i.test(name)) return false; // "MAANDeA knall r!", "WOENSeDrA!G ll knall"
    if (/^(MAAND|DINSD|WOENS|DONDER|VRIJDA|ZATERD|ZONDA)/i.test(name) && name.length < 25) return false;
    // Supermarket names as product names (from price comparison pages)
    // Catch single, repeated, or combined supermarket names like "ALBERT HEIJN ALBERT HEIJN", "HEIJN JUMBO ALBERT HEIJN JUMBO"
    const supermarketNames = ['JUMBO', 'ALBERT HEIJN', 'ALBERT', 'HEIJN', 'LIDL', 'PLUS', 'COOP', 'DEKAMARKT', 'BONI', 'POIESZ', 'AH', 'DIRK', 'VOMAR', 'HOOGVLIET'];
    const nameUpper = name.toUpperCase().trim();
    const nameWordsOnly = nameUpper.replace(/[\d.,\s]+/g, ' ').trim();
    if (nameWordsOnly.split(/\s+/).every(w => supermarketNames.some(s => s.includes(w) || w.includes(s)))) return false;
    if (/^(JUMBO|ALBERT HEIJN|LIDL|PLUS|COOP|DEKAMARKT|BONI|POIESZ|AH|DIRK|VOMAR|HOOGVLIET)(\s+(JUMBO|ALBERT HEIJN|LIDL|PLUS|COOP|DEKAMARKT|BONI|POIESZ|AH|DIRK|VOMAR|HOOGVLIET|\d+))*\s*$/i.test(name)) return false;
    // Garbled text with too many consecutive consonants or mixed case chaos
    if (/[A-Z][a-z][A-Z][a-z][A-Z]/.test(name) && name.length < 20) return false; // "leAG kRnIaJlD"
    // Garbled promotional text
    if (/^(weeeek|brraaak|goedkop\s*er)/i.test(name)) return false;
    if (/^(drinks of bars|pakje à)/i.test(name)) return false;
    // "van X.XX tot X.XX" price comparison text
    if (/^van\s+\d/i.test(name)) return false;
    // "Alléén geldig" (promo text, not product)
    if (/^Alléén\s+geldig/i.test(name)) return false;
    // Packaging/container terms as product names
    if (/^(XL[-\s]?SCHAAL|SCHAAL|BAKJE|DOOSJE|FLESJE|ZAKJE|POTJE|CUPJE|BEKERTJE|KUIPJE|BAKJE)\b$/i.test(name)) return false;
    // "NU NU" repetitions and garbled promotional text
    if (/\bNU\s+NU\b/i.test(name)) return false;
    // Names ending with repeated words or garbled suffixes
    if (/\b(NU|JA|NEE|OK)\s*$/i.test(name) && name.split(/\s+/).length <= 2) return false;
    // "Spritsen" type garbled text (but allow "Sprits" which is a real cookie)
    if (/spritsen/i.test(name)) return false;
    // Generic descriptors that aren't product names
    if (/^(Diverse\s+soorten|Alle\s+soorten|Vers\s+gesneden|Huismerk|Alle\s+varianten)/i.test(name)) return false;
    // Standalone packaging with size (e.g. "XL-SCHAAL 500g")
    if (/^(XL|XXL|GIGA|MINI|MAXI)[-\s]*(SCHAAL|BAK|DOOS|BEKER|KUIP|POT|FLES)/i.test(name)) return false;
    // "geldig" dates / promo periods
    if (/geldig\s+(t\/m|van|tot)/i.test(name)) return false;
    // "alleen" conditions
    if (/^alleen\s/i.test(name)) return false;
    // Standalone section headers
    if (/^(DIEPVRIES|ZUIVEL|BROOD|DRANKEN|HUISHOUD|BAKKERIJ|AGF|VLEES|VIS|KAAS|SNOEP|KOEK|SAUZEN|CONSERVEN|PASTA|RIJST|ONTBIJT|CHIPS|NOTEN|KOFFIE|THEE)\s*$/i.test(name)) return false;
    // Appliance descriptions / non-food product text
    if (/machine\b/i.test(name) && /\b(dolce|gusto|nespresso|senseo|tassimo|philips|bosch|siemens|braun|krups)\b/i.test(name)) return false;
    if (/^(Geschikt\s+voor|Compatibel\s+met|Werkt\s+met|Passend\s+voor)/i.test(name)) return false;
    // Standalone packaging/unit words as entire name
    if (/^(flessen|zakken|zakjes|pakken|blikken|rollen|dozen|bossen|kratten|potjes|bakjes|cupjes|kuipjes|tubes)\b(\s+\d+.*)?$/i.test(name)) return false;
    // Standalone promo/label words
    if (/^(NIEUW|ACTIE|GRATIS|BONUS|AANBIEDING|VOORDEEL|RECLAME|KORTING)\s*!?$/i.test(name)) return false;
    // Description/flavor text (not a product name)
    if (/^(neutrale\s+smaak|zoete\s+smaak|milde\s+smaak|frisse\s+smaak|romige\s+smaak)/i.test(name)) return false;
    // Garbled text with "RTING" or "KO" fragments (corrupted "KORTING")
    if (/\bRTING\b/i.test(name)) return false;
    // Promotional slogans
    if (/^(Vrolijk|Voordelig|Feestelijk|Gezellig)\s+(Voordelig|Pasen|Kerst|Feest)/i.test(name)) return false;
    if (/Vieren!?\s*$/i.test(name) && !/\b(product|merk)\b/i.test(name)) return false;
    // Garbled "TELER" fragments
    if (/^TELER\b/i.test(name)) return false;
    // Non-product descriptors: "Exclusief decoratie", "potmaat X cm", "Hoogte X cm"
    if (/^(Exclusief|potmaat|Hoogte)\s/i.test(name)) return false;
    if (/potmaat\s+\d/i.test(name) && name.split(/\s+/).length <= 4) return false;
    // Non-grocery household items (work lamps, kitchen sets, etc.)
    if (/\b(Werklamp|Zaklamp|Boormachine|Slijptol|Schroefmachine)\b/i.test(name)) return false;
    if (/^(Kruidenpotjes|Voorraadpotten|Serviesset|Bestek)\b/i.test(name)) return false;
    // Standalone "VOORDEELSTUK" (not a product)
    if (/^VOORDEELSTUK\s*$/i.test(name)) return false;
    // Heavily garbled text with alternating case chaos (e.g. "WVOaEsNtSeDrA!G leAG kRnIaJlD")
    if ((/[A-Z][a-z][A-Z]/.test(name) || /[a-z][A-Z][a-z]/.test(name)) && /[!]/.test(name)) return false;
    if (/\b[a-z][A-Z][a-z][A-Z]\b/.test(name)) return false;  // "kRnI"
    // Words with 3+ consecutive identical vowels (garbled OCR text), except known brands
    if (/([aeiou])\1{2}/i.test(name) && !/dubbelfrisss/i.test(name)) return false;
    // Words starting with double same letter followed by 6+ chars (e.g. "Vvaosotreeednakg")
    if (/\b([A-Za-z])\1[a-z]{6,}/i.test(name) && !/dubbelfrisss/i.test(name)) return false;
    // "EUR" prefix from currency (e.g. "EUR HAK SPLITERWTEN")
    if (/^EUR\s+/i.test(name)) return false;
    // "VA VOMAR" prefix from garbled text
    if (/^VA\s+VOMAR/i.test(name)) return false;
    // "1AN" type garbled suffixes
    if (/\s+\d+[A-Z]{1,2}$/i.test(name) && !/\s+\d+(ml|cl|gr|kg|cm|st)\b/i.test(name)) return false;
    // Section headers like "Bloemen & Planten"
    if (/^(Bloemen\s*[&+]\s*Planten|Non[-\s]?Food|Huishoudelijk|Drogisterij)\s*$/i.test(name)) return false;
    // Non-grocery: tools, hats, decorations with measurements
    if (/\bAfmeting:\s*\d/i.test(name)) return false;
    if (/^(Paashaas|Magnetische)\s/i.test(name)) return false;
    // "Vrolijk Voordelig Pasen Vieren" type promotional slogans
    if (/Pasen\s+Vieren/i.test(name)) return false;
    // Description text leaking into product names (sentence-like: "Een zuivere...", "Met echte...")
    if (/\bEen\s+(zuivere|heerlijke|lekkere|echte|verfrissende)\b/i.test(name)) return false;
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
      if (/^(Dagelijks|Bovenop|Download|Prijsvoorbeeld|Alléén|Meer halen|Keuze uit|Kies|Diverse|Alle soorten|Per stuk|Per\s\d|Geschikt|Inclusief|Fles\s|Zak\s|Pak\s|Bak\s|Pot\s|Schaal\s|Net\s|Stuk\s|Heel\.|Los\.|Om\sthuis|Maat\s|Maten\s|Doos\s)/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      // Garbled OP=OP fragments
      if (/^O=P$/i.test(line) || /^OP$/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      // Price comparison and customer limit text
      if (/^Bij\s/i.test(line) || /perklant|per\s+klant/i.test(line) || /Mediamarkt|Bol\.com|Kruidvat\.nl|Amazon/i.test(line)) {
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
        // Don't count short conjunctions ("of", "en") as a full name part
        const isConjunction = /^(of|en|OF|EN)$/i.test(line);
        nameParts.unshift(line);
        if (!isConjunction && nameParts.length >= 4) break;
        if (nameParts.length >= 6) break; // absolute max
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
      if (/^(PER\s|ALLE\s|TOT\s|MET\s|ZONDER|VOUCHER|ACTIE|DIEPVRIES|GRATIS|OP=OP|\d+\+\d|KORTING|[¤€]|Max\.|Alleen|Geen|Adviesprijs)/i.test(line)) continue;
      if (/^[\d.,\-\s]+$/.test(line) && line.length < 10) {
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d{1,2}[a-z]$/i.test(line)) { // coded prices like "2t", "14t"
        if (nameParts.length > 0) break;
        continue;
      }
      if (/^\d+[.,]\d{2}\s*-\s*\d+[.,]\d{2}$/.test(line)) continue;
      if (/^\d+\s*(GRAM|KILO|LITER|ML|CL|STUKS|PAKKEN)/i.test(line)) continue;
      if (/^(STUKS|GRAM|KILO|LITER)\b/i.test(line)) continue;
      // Price comparison and customer limit text
      if (/^Bij\s/i.test(line) || /perklant|per\s+klant/i.test(line) || /Mediamarkt|Bol\.com|Kruidvat\.nl|Amazon/i.test(line)) continue;
      // Packaging/container lines (e.g. "Doos 6 kilo", "Blik 250 ml")
      if (/^(Doos|Blik|Tray|Flesje|Busje|Tube|Rol)\s/i.test(line)) {
        if (nameParts.length > 0) break;
        continue;
      }
      // Garbled OP=OP fragments
      if (/^O=P$/i.test(line) || (/^OP$/i.test(line) && nameParts.length > 0)) {
        if (nameParts.length > 0) break;
        continue;
      }

      // Stop at description/detail lines once we have a name
      if (nameParts.length > 0 && /^(Alle soorten|Keuze uit|Per stuk|Per\s\d|Pak\s|Fles\s|Zak\s|Bak\s|Pot\s|Schaal\s|Stuk\s|Los\.|Diverse|Doos\s)/i.test(line)) break;

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

    let name = nameParts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^(OP=OP|NIEUW|DIEPVRIES|SET|KRAT|TRAY)\s+/i, '')
      // Strip packaging prefixes: "ZAKKEN Appelflap" → "Appelflap", "flessen 1,25 liter Pickwick" → "Pickwick"
      .replace(/^(ZAKKEN|PAKKEN|FLESSEN|BLIKKEN|ROLLEN|BOSSEN|KRATTEN|DOZEN|TUBES|POTTEN|KUIPJES|BAKJES)\s+/i, '')
      .replace(/^(flessen|pakken|zakken|blikken|rollen|dozen)\s+\d+[.,]?\d*\s*(liter|ml|cl|gram|kilo|kg|g|l)\s+/i, '')
      // Strip leading unit info: "6 x 330 ml Coca Cola" → "Coca Cola"
      .replace(/^\d+\s*x\s*\d+\s*(ml|cl|liter|l|gram|g|kg|kilo)\s+/i, '')
      // Strip TRAY/KRAT/SET in the middle of names
      .replace(/\s+(TRAY|KRAT|SET|BOX)\s+/i, ' ')
      .replace(/\s+\d+[a-z]$/i, '')
      .replace(/\s+O=P$/i, '')  // remove trailing garbled OP=OP
      .replace(/\s+OP$/i, '')   // remove trailing "OP"
      .replace(/\s+(NU\s*)+$/i, '')  // remove trailing "NU NU" etc.
      .replace(/\s+(en|met)\s*$/i, '')  // trim trailing conjunctions (but keep "of" for "ananas OF mango")
      .trim();

    // Only trim trailing "of" if it's truly at the end (not "X of Y")
    if (/\sof\s*$/i.test(name) && !/ of /i.test(name.slice(0, -3))) {
      name = name.replace(/\s+of\s*$/i, '').trim();
    }

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

  /**
   * Enrich parsed folder products with API data and convert to ScrapedProduct[]
   */
  private async enrichProducts(
    parsed: FolderProduct[],
    validFrom: Date,
    validUntil: Date,
    label: string,
  ): Promise<ScrapedProduct[]> {
    this.logger.info(`Enriching ${parsed.length} ${label} products from Vomar API...`);
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
        const catalogPrice = apiResult.price;

        if (apiResult.images?.[0]?.imageUrl) {
          imageUrl = `${VOMAR_IMAGE_CDN}/${apiResult.images[0].imageUrl}`;
        }

        title = apiResult.brand
          ? `${apiResult.brand} ${apiResult.description}`
          : apiResult.description;
        productUrl = `https://www.vomar.nl/producten?articleNumber=${apiResult.articleNumber}`;

        // === Price calculation based on deal type ===

        if (p.comboCount && p.comboPrice) {
          // Combo deal: "3 VOOR 8" → per-item discount price = 8/3
          discountPrice = Math.round(p.comboPrice / p.comboCount * 100) / 100;
          originalPrice = catalogPrice;
          if (originalPrice > discountPrice) {
            discountPercentage = Math.round((1 - discountPrice / originalPrice) * 100);
          }
        } else if (p.dealPercentage && p.dealPercentage > 0) {
          // Percentage deal (1+1 GRATIS = 50%, 25% KORTING, 2e HALVE PRIJS = 25%)
          originalPrice = catalogPrice;
          discountPrice = Math.round(catalogPrice * (1 - p.dealPercentage / 100) * 100) / 100;
          discountPercentage = p.dealPercentage;
        } else if (p.folderPrice && p.folderPrice < catalogPrice * 0.95) {
          // Folder has an explicit deal price that's lower than catalog price
          // This catches AANBIEDING/ACTIE/OP=OP products with deal prices
          discountPrice = p.folderPrice;
          originalPrice = catalogPrice;
          discountPercentage = Math.round((1 - discountPrice / originalPrice) * 100);
        } else if (p.folderPrice) {
          // Folder price exists but is close to or above catalog price
          // The folder price might be for a different variant; use catalog price
          discountPrice = p.folderPrice;
        } else {
          // No folder price, no percentage — use catalog price as-is
          discountPrice = catalogPrice;
        }
      } else {
        apiMisses++;

        if (p.comboCount && p.comboPrice) {
          // Combo deal without API match: use combo math
          discountPrice = Math.round(p.comboPrice / p.comboCount * 100) / 100;
          title = p.name;
        } else if (p.folderPrice) {
          discountPrice = p.folderPrice;
          title = p.name;
          this.logger.debug(`  No API match, using folder price: ${p.name} → €${p.folderPrice}`);
        } else if (p.dealPercentage) {
          // Has percentage but no price — skip
          this.logger.debug(`  No API match and no folder price for: ${p.name}`);
          continue;
        } else {
          this.logger.debug(`  No API match and no folder price for: ${p.name}`);
          continue;
        }
      }

      products.push({
        title,
        discount_price: discountPrice,
        original_price: originalPrice,
        discount_percentage: discountPercentage,
        unit_info: p.isVoucherDeal
          ? (p.dealType?.includes('Vomar app') ? p.dealType : `${p.dealType || 'ACTIE'} (Vomar app)`)
          : p.dealType,
        valid_from: validFrom,
        valid_until: validUntil,
        category_slug: this.detectCategory(title),
        product_url: productUrl,
        image_url: imageUrl,
        requires_card: p.isVoucherDeal || false,
      });

      this.logger.debug(`  ${title} — €${discountPrice}${originalPrice ? ` (was €${originalPrice})` : ''} [${p.dealType || ''}]`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info(`${label} API matches: ${apiHits}/${parsed.length} (${apiMisses} missed)`);
    return products;
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const { monday, sunday } = this.getWeekDates();
    const allProducts: ScrapedProduct[] = [];

    // === Part 1: Weekly folder ===
    this.logger.info('=== Fetching weekly folder ===');
    try {
      const spreads = await this.fetchSpreadsData(
        'https://view.publitas.com/folder-deze-week',
        'weekly folder'
      );
      const pageTexts = this.extractPageTexts(spreads);
      this.logger.info(`Got text from ${pageTexts.length} pages`);

      const parsed = this.parseProducts(pageTexts);
      this.logger.success(`Found ${parsed.length} products in weekly folder`);
      for (const p of parsed) {
        this.logger.debug(`  ${p.name} [${p.dealType || 'no deal'}] ${p.folderPrice ? '€' + p.folderPrice : ''}`);
      }

      const weeklyProducts = await this.enrichProducts(parsed, monday, sunday, 'Weekly');
      allProducts.push(...weeklyProducts);
      this.logger.success(`${weeklyProducts.length} weekly folder products enriched`);
    } catch (err) {
      this.logger.error(`Failed to scrape weekly folder: ${err}`);
    }

    // Close browser before opening a new page for dagknallers
    await this.cleanup();

    // === Part 2: Dagknallers (day deals) ===
    this.logger.info('=== Fetching dagknallers ===');
    try {
      const dagSpreads = await this.fetchSpreadsData(
        'https://view.publitas.com/dagknallers',
        'dagknallers'
      );
      const dagPages = this.extractPageTexts(dagSpreads);
      this.logger.info(`Got text from ${dagPages.length} dagknaller pages`);

      // Use specialized dagknaller parser (generic parser struggles with garbled day-name text)
      const dagParsed = this.parseDagknallerProducts(dagPages);
      this.logger.success(`Found ${dagParsed.length} products in dagknallers`);
      for (const p of dagParsed) {
        this.logger.debug(`  ${p.name} [${p.dealType || 'no deal'}] ${p.folderPrice ? '€' + p.folderPrice : ''}`);
      }

      // Dagknallers recur weekly — valid for the whole week
      const dagProducts = await this.enrichProducts(dagParsed, monday, sunday, 'Dagknaller');

      // Mark dagknaller products with deal type prefix for clarity
      for (const dp of dagProducts) {
        if (dp.unit_info && !dp.unit_info.startsWith('Dagknaller')) {
          dp.unit_info = `Dagknaller: ${dp.unit_info}`;
        } else if (!dp.unit_info) {
          dp.unit_info = 'Dagknaller';
        }
      }

      // Dedup against weekly products (same title = skip dagknaller version)
      const weeklyTitles = new Set(allProducts.map(p => p.title.toLowerCase()));
      const uniqueDag = dagProducts.filter(p => !weeklyTitles.has(p.title.toLowerCase()));
      allProducts.push(...uniqueDag);
      this.logger.success(`${uniqueDag.length} unique dagknaller products added (${dagProducts.length - uniqueDag.length} duplicates skipped)`);
    } catch (err) {
      this.logger.warning(`Failed to scrape dagknallers (non-fatal): ${err}`);
    }

    this.logger.success(`Total: ${allProducts.length} deal products from Vomar`);
    return allProducts;
  }
}
