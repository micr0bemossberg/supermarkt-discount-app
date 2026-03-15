/**
 * Vomar OCR Validation Script
 *
 * Sends Publitas flyer page images to Gemini Flash for structured product extraction,
 * then compares against the text-based extraction from spreads.json.
 *
 * Usage:
 *   npx ts-node src/validate-vomar-ocr.ts                    # Fetch fresh + Gemini
 *   npx ts-node src/validate-vomar-ocr.ts --cached            # Use saved spreads_data.json
 *   npx ts-node src/validate-vomar-ocr.ts --pages 1,2,3       # Only process specific pages
 *   npx ts-node src/validate-vomar-ocr.ts --text-only          # Skip Gemini, just dump text products
 *   npx ts-node src/validate-vomar-ocr.ts --gemini-only        # Skip text parser, just dump Gemini
 *   npx ts-node src/validate-vomar-ocr.ts --dump-images        # Save page images to disk
 *   npx ts-node src/validate-vomar-ocr.ts --concurrency 15     # Override parallel requests (default: auto)
 *
 * API keys: Set gemini_api_key1..N in packages/scraper/src/ocr/.env
 * Images: Uses at2400 (highest) resolution from Publitas CDN for best OCR quality.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { extractPages, downloadImageAsBase64, type PublitasPage } from './ocr/publitasImages';
import { extractProductsFromImage, getApiKeyStats, type GeminiProduct, type GeminiPageResult } from './ocr/ocrClient';
import { validateProducts, formatReport, type TextProduct } from './ocr/ocrValidator';

const PUBLITAS_URL = 'https://view.publitas.com/folder-deze-week';
const SPREADS_CACHE_PATH = path.join(__dirname, '..', 'scripts', 'spreads_data.json');

// ─── Minimal text parser (mirrors VomarScraper for comparison baseline) ───

const PRICE_CODE_MAP: Record<string, number> = {
  'a': 0, 'b': 9, 'c': 15, 'd': 19, 'e': 25, 'f': 29,
  'g': 35, 'h': 39, 'i': 40, 'j': 49, 'k': 50, 'l': 55,
  'm': 59, 'n': 65, 'o': 69, 'p': 79, 'q': 85, 'r': 89,
  's': 95, 't': 99,
};

function decodePriceCode(code: string): number | undefined {
  const match = code.match(/^(\d{1,2})([a-t])$/i);
  if (!match) return undefined;
  const euros = parseInt(match[1]);
  const cents = PRICE_CODE_MAP[match[2].toLowerCase()];
  return cents !== undefined ? euros + cents / 100 : undefined;
}

function extractTextProducts(pages: PublitasPage[]): TextProduct[] {
  const products: TextProduct[] = [];

  for (const page of pages) {
    if (!page.text) continue;
    const lines = page.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = page.text;

    // Skip non-product pages
    if (/spelvoorwaarden/i.test(fullText) && /win\s/i.test(fullText)) continue;
    if (/nieuwsbrief/i.test(fullText) && fullText.length < 500) continue;
    const supermarketMentions = (fullText.match(/\b(ALBERT HEIJN|JUMBO|PICNIC)\b/gi) || []).length;
    if (supermarketMentions >= 4 && /VOMAR/i.test(fullText)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let price: number | null = null;

      const explicitMatch = line.match(/^[€¤]?\s*(\d{1,2})[.,](\d{2})$/);
      if (explicitMatch) price = parseFloat(`${explicitMatch[1]}.${explicitMatch[2]}`);

      if (price === null && /^\d{1,2}[a-t]$/i.test(line)) {
        price = decodePriceCode(line) ?? null;
      }
      if (price === null) {
        const spacedMatch = line.match(/^(\d{1,2})\s+\.(\d{2})$/);
        if (spacedMatch) price = parseFloat(`${spacedMatch[1]}.${spacedMatch[2]}`);
      }
      if (price === null) continue;

      let productName = '';
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const candidate = lines[j];
        if (/^[€¤]?\s*\d{1,2}[.,]\d{2}$/.test(candidate)) break;
        if (/^\d{1,2}[a-t]$/i.test(candidate)) break;
        if (/^(GRATIS|ACTIE|VOUCHER|NU|1\+1|2\+2|OP=OP)$/i.test(candidate)) break;
        if (candidate.length >= 3 && /[a-zA-Z]{2,}/.test(candidate) &&
            !/^(van|tot|per|alle|met|zonder|vanaf|prijsvoorbeeld)/i.test(candidate) &&
            !/Vomar-app|spelvoorwaarden|nieuwsbrief/i.test(candidate)) {
          productName = candidate;
          break;
        }
      }

      if (productName) {
        let originalPrice: number | null = null;
        for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
          const vanMatch = lines[j].match(/van\s+[€¤]?\s*(\d{1,2})[.,](\d{2})/i);
          if (vanMatch) { originalPrice = parseFloat(`${vanMatch[1]}.${vanMatch[2]}`); break; }
        }
        products.push({ name: productName, price, originalPrice, dealType: null, pageNum: page.pageNum });
      }
    }
  }

  const seen = new Map<string, TextProduct>();
  for (const p of products) {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

// ─── Fetch spreads.json ───

async function fetchSpreadsData(useCached: boolean): Promise<any[]> {
  if (useCached && fs.existsSync(SPREADS_CACHE_PATH)) {
    console.log(`Using cached spreads data from ${SPREADS_CACHE_PATH}`);
    const data = JSON.parse(fs.readFileSync(SPREADS_CACHE_PATH, 'utf-8'));
    return Array.isArray(data) ? data : Object.values(data);
  }

  console.log('Launching browser to fetch spreads.json...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let spreadsData: any = null;

  page.on('response', async (response) => {
    if (response.url().includes('spreads.json')) {
      try {
        spreadsData = await response.json();
        console.log(`  Captured spreads.json (${JSON.stringify(spreadsData).length} bytes)`);
      } catch { console.error('  Failed to parse spreads.json'); }
    }
  });

  await page.goto(PUBLITAS_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await browser.close();

  if (!spreadsData) throw new Error('Failed to capture spreads.json from Publitas');

  const cacheDir = path.dirname(SPREADS_CACHE_PATH);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(SPREADS_CACHE_PATH, JSON.stringify(spreadsData, null, 2), 'utf-8');
  console.log(`  Cached spreads data to ${SPREADS_CACHE_PATH}`);

  return Array.isArray(spreadsData) ? spreadsData : Object.values(spreadsData);
}

// ─── Gemini pipeline (parallel with multi-key round-robin) ───

async function processPage(page: PublitasPage): Promise<GeminiPageResult> {
  // Use highest resolution image for best OCR quality
  const imageUrl = page.imageUrlHigh || page.imageUrl;
  if (!imageUrl) {
    console.warn(`  Page ${page.pageNum}: No image URL, skipping`);
    return { pageNum: page.pageNum, products: [], error: 'No image URL' };
  }

  try {
    const base64 = await downloadImageAsBase64(imageUrl);
    const sizeKB = (base64.length * 3 / 4 / 1024).toFixed(0);
    console.log(`  Page ${page.pageNum}: Sending to Gemini (${sizeKB}KB, hi-res)...`);

    const result = await extractProductsFromImage(base64, page.pageNum);

    if (result.error) {
      console.error(`  Page ${page.pageNum}: ${result.error}`);
    } else {
      console.log(`  Page ${page.pageNum}: found ${result.products.length} products`);
    }

    return result;
  } catch (err: any) {
    console.error(`  Page ${page.pageNum}: Failed - ${err.message}`);
    return { pageNum: page.pageNum, products: [], error: err.message };
  }
}

async function runGeminiOnPages(
  pages: PublitasPage[],
  pageFilter?: number[],
  concurrency?: number,
): Promise<GeminiPageResult[]> {
  const pagesToProcess = pageFilter
    ? pages.filter(p => pageFilter.includes(p.pageNum))
    : pages;

  // Auto-determine concurrency: keys × 2 balances throughput vs socket limits
  const stats = getApiKeyStats();
  const effectiveConcurrency = concurrency ?? Math.min(pagesToProcess.length, stats.keyCount * 2);

  console.log(`\nSending ${pagesToProcess.length} pages to Gemini Flash`);
  console.log(`  API keys: ${stats.keyCount} (${stats.maxRpm} RPM total), concurrency: ${effectiveConcurrency}\n`);

  // Process pages in parallel batches
  const results: GeminiPageResult[] = [];
  for (let i = 0; i < pagesToProcess.length; i += effectiveConcurrency) {
    const batch = pagesToProcess.slice(i, i + effectiveConcurrency);
    const batchResults = await Promise.all(batch.map(processPage));
    results.push(...batchResults);
  }

  // Sort by page number for consistent output
  results.sort((a, b) => a.pageNum - b.pageNum);
  return results;
}

// ─── Output formatting ───

function formatProductLine(p: GeminiProduct & { pageNum: number }): string {
  const parts: string[] = [`[pg ${String(p.pageNum).padStart(2)}]`];

  // Name + brand
  parts.push(`"${p.name}"`);

  // Price info
  const price = p.discountPrice?.toFixed(2) ?? '?';
  if (p.originalPrice) {
    parts.push(`E${price} (was E${p.originalPrice.toFixed(2)})`);
  } else {
    parts.push(`E${price}`);
  }

  // Deal type
  if (p.dealType) parts.push(`[${p.dealType}]`);

  // Discount %
  if (p.discountPercentage) parts.push(`-${p.discountPercentage}%`);

  // Unit info
  if (p.unitInfo) parts.push(`{${p.unitInfo}}`);

  // Category
  if (p.category) parts.push(`<${p.category}>`);

  // Voucher
  if (p.isVoucher) parts.push('(VOUCHER)');

  return '  ' + parts.join(' ');
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const useCached = args.includes('--cached');
  const textOnly = args.includes('--text-only');
  const geminiOnly = args.includes('--gemini-only');
  const dumpImages = args.includes('--dump-images');

  let concurrency: number | undefined;
  const concurrencyIdx = args.indexOf('--concurrency');
  if (concurrencyIdx >= 0 && args[concurrencyIdx + 1]) {
    concurrency = Math.max(1, parseInt(args[concurrencyIdx + 1]) || 10);
  }

  let pageFilter: number[] | undefined;
  const pagesIdx = args.indexOf('--pages');
  if (pagesIdx >= 0 && args[pagesIdx + 1]) {
    pageFilter = args[pagesIdx + 1].split(',').map(Number).filter(n => !isNaN(n));
  }

  console.log('========================================================');
  console.log('       VOMAR VALIDATION TOOL (Gemini Flash)             ');
  console.log('========================================================\n');

  // Step 1: Get spreads data
  const spreadsData = await fetchSpreadsData(useCached);
  const pages = extractPages(spreadsData);
  console.log(`\nExtracted ${pages.length} pages from spreads data\n`);

  // Step 2: Dump images (optional)
  if (dumpImages) {
    const imgDir = path.join(__dirname, '..', 'ocr-images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    for (const page of pages) {
      const url = page.imageUrlHigh || page.imageUrl;
      if (!url) continue;
      try {
        console.log(`  Saving page ${page.pageNum} image (hi-res)...`);
        const base64 = await downloadImageAsBase64(url);
        fs.writeFileSync(path.join(imgDir, `vomar-page-${String(page.pageNum).padStart(2, '0')}.jpg`), Buffer.from(base64, 'base64'));
        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) { console.warn(`  Page ${page.pageNum}: ${err.message}`); }
    }
    console.log(`\nImages saved to ${imgDir}\n`);
  }

  // Step 3: Text extraction (for comparison)
  if (!geminiOnly) {
    console.log('--- TEXT EXTRACTION ------------------------------------');
    const textProducts = extractTextProducts(pages);
    console.log(`Text parser found ${textProducts.length} products:\n`);
    for (const p of textProducts) {
      console.log(`  [pg ${p.pageNum}] "${p.name}" E${p.price?.toFixed(2) ?? '?'}`);
    }
    console.log('');
    if (textOnly) { console.log('Done (--text-only mode).'); return; }
  }

  // Step 4: Gemini extraction
  console.log('--- GEMINI EXTRACTION ----------------------------------');
  const startTime = Date.now();
  const geminiResults = await runGeminiOnPages(pages, pageFilter, concurrency);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Flatten products with page numbers
  const allGeminiProducts: Array<GeminiProduct & { pageNum: number }> = [];
  for (const result of geminiResults) {
    for (const product of result.products) {
      allGeminiProducts.push({ ...product, pageNum: result.pageNum });
    }
  }

  // Deduplicate by name
  const seen = new Map<string, GeminiProduct & { pageNum: number }>();
  for (const p of allGeminiProducts) {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) seen.set(key, p);
  }
  const uniqueGeminiProducts = Array.from(seen.values());

  // Stats
  const errors = geminiResults.filter(r => r.error).length;
  const vouchers = uniqueGeminiProducts.filter(p => p.isVoucher).length;
  const withOrigPrice = uniqueGeminiProducts.filter(p => p.originalPrice !== null).length;
  const withPercent = uniqueGeminiProducts.filter(p => p.discountPercentage !== null).length;
  const categories = new Map<string, number>();
  for (const p of uniqueGeminiProducts) {
    const cat = p.category || 'unknown';
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  console.log(`\n--- RESULTS (${elapsed}s) ----------------------------------`);
  console.log(`  Total: ${uniqueGeminiProducts.length} unique (${allGeminiProducts.length} raw)`);
  console.log(`  Errors: ${errors} pages`);
  console.log(`  Voucher deals: ${vouchers}`);
  console.log(`  With original price: ${withOrigPrice}`);
  console.log(`  With discount %: ${withPercent}`);
  console.log(`  Categories: ${Array.from(categories.entries()).map(([c, n]) => `${c}(${n})`).join(', ')}`);
  console.log('');

  for (const p of uniqueGeminiProducts) {
    console.log(formatProductLine(p));
  }
  console.log('');

  if (geminiOnly) { console.log('Done (--gemini-only mode).'); return; }

  // Step 5: Validate
  console.log('--- VALIDATION -----------------------------------------');
  const textProducts = extractTextProducts(pages);
  const report = validateProducts(uniqueGeminiProducts, textProducts);
  console.log(formatReport(report));

  // Step 6: Save reports
  const reportPath = path.join(__dirname, '..', 'vomar-validation-report.txt');
  fs.writeFileSync(reportPath, formatReport(report), 'utf-8');
  console.log(`\nReport saved to ${reportPath}`);

  // Save Gemini raw responses
  const rawPath = path.join(__dirname, '..', 'vomar-gemini-raw.json');
  fs.writeFileSync(rawPath, JSON.stringify(geminiResults, null, 2), 'utf-8');
  console.log(`Gemini raw responses saved to ${rawPath}`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
