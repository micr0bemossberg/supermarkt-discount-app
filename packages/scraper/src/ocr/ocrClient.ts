/**
 * Gemini Flash API client for multimodal product extraction from flyer images.
 * Sends page images to Gemini with a structured prompt and gets back
 * parsed products directly — no separate OCR + regex parsing needed.
 *
 * Supports multiple API keys with round-robin distribution for max throughput.
 * Requires gemini_api_key1..N in packages/scraper/src/ocr/.env
 */

import * as https from 'https';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load from root .env (all keys consolidated there)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export interface GeminiProduct {
  name: string;
  description: string | null;
  brand: string | null;
  discountPrice: number | null;
  originalPrice: number | null;
  discountPercentage: number | null;
  dealType: string | null;
  unitInfo: string | null;
  isVoucher: boolean;
  category: string | null;
}

export interface GeminiPageResult {
  pageNum: number;
  products: GeminiProduct[];
  rawResponse?: string;
  error?: string;
}

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── API Key Pool (round-robin across all available keys) ───

class ApiKeyPool {
  private keys: string[] = [];
  private expiredKeys = new Set<string>();
  private index: number = 0;

  constructor() {
    for (let i = 1; i <= 50; i++) {
      const key = process.env[`gemini_api_key${i}`];
      if (key) this.keys.push(key.trim());
    }
    if (this.keys.length === 0) {
      throw new Error(
        'No gemini_api_key* found in packages/scraper/src/ocr/.env\n' +
        'Set gemini_api_key1, gemini_api_key2, etc.\n' +
        'Get keys at: https://aistudio.google.com/apikey'
      );
    }
  }

  /** Get the next key in round-robin order, skipping expired keys. */
  getNext(): string {
    const active = this.keys.filter(k => !this.expiredKeys.has(k));
    if (active.length === 0) {
      throw new Error('All API keys are expired! Replace them in packages/scraper/src/ocr/.env');
    }
    const key = active[this.index % active.length];
    this.index++;
    return key;
  }

  /** Mark a key as expired so it won't be used again this session. */
  markExpired(key: string): void {
    this.expiredKeys.add(key);
    console.warn(`    ⚠ API key ...${key.slice(-6)} expired, ${this.activeCount} keys remaining`);
  }

  get count(): number { return this.keys.length; }
  get activeCount(): number { return this.keys.length - this.expiredKeys.size; }
  /** Max requests per minute across active keys (15 RPM per key). */
  get maxRpm(): number { return this.activeCount * 15; }
}

let _pool: ApiKeyPool | null = null;
function getKeyPool(): ApiKeyPool {
  if (!_pool) _pool = new ApiKeyPool();
  return _pool;
}

/** Returns the number of available API keys and total RPM capacity. */
export function getApiKeyStats(): { keyCount: number; activeCount: number; maxRpm: number } {
  const pool = getKeyPool();
  return { keyCount: pool.count, activeCount: pool.activeCount, maxRpm: pool.maxRpm };
}

const EXTRACTION_PROMPT = `You are analyzing a page from a Dutch supermarket (Vomar) weekly deals flyer.
Extract ALL discount products shown on this page.

For each product return a JSON object with these fields:
- "name": Product name (brand + description, e.g. "Campina Yoghurt", "Unox Soep in Zak"). Concise but complete.
- "brand": The brand name separately if identifiable (e.g. "Campina", "Heinz", "G'woon"), or null if it's a generic/store product.
- "description": Additional product details visible on the card (e.g. "Diverse varianten", "Alle variëteiten", "Naturel, Kip of met Kaas"), or null if none shown.
- "discountPrice": The deal/discount price in euros as a number (e.g. 2.49). For combo deals like "2 VOOR 4.49", give the combo total (4.49). For percentage deals, give the discounted price if shown.
- "originalPrice": The original/regular price if shown (number), or null if not visible. Look for "van X.XX" or strikethrough prices.
- "discountPercentage": The discount percentage as a whole number if shown (e.g. 25 for "25% KORTING"), or null.
- "dealType": The deal type text exactly as shown (e.g. "1+1 GRATIS", "25% KORTING", "2 VOOR 4.49", "OP=OP", "3 STUKS", "PER STUK"), or null.
- "unitInfo": Product size/weight/volume/quantity if shown (e.g. "1 liter", "500 g", "6-pack", "per kg", "4 stuks", "75 cl"), or null.
- "isVoucher": true if this deal requires activating a voucher in the Vomar app (look for "VOUCHER", "Met voucher", "VOUCHER ACTIE" labels), false otherwise.
- "category": Classify the product into ONE of these categories:
  "zuivel" (dairy, yoghurt, cheese, milk, butter, eggs),
  "vlees" (meat, poultry, fish),
  "groente-fruit" (fruits, vegetables, salads),
  "brood-bakkerij" (bread, bakery, pastries),
  "dranken" (drinks, juice, soda, water, coffee, tea),
  "bier-wijn" (beer, wine, spirits, alcohol),
  "snacks" (chips, nuts, candy, chocolate, cookies),
  "diepvries" (frozen food),
  "huishouden" (cleaning, household, paper, laundry),
  "verzorging" (personal care, hygiene, deodorant),
  "dieren" (pet food, pet supplies),
  "bloemen-planten" (flowers, plants),
  "non-food" (clothing, toys, kitchenware, electronics, tools),
  "pasen" (Easter-specific seasonal products),
  "overig" (anything that doesn't fit above).

Rules:
- Extract ALL products with visible prices, including non-food items with clear deal prices (OP=OP items, household goods, etc.)
- Skip page headers, promotional slogans, section titles, competition/sweepstakes content, and price comparison tables
- Prices in the flyer sometimes appear as styled numbers. Extract the actual euro amount.
- If a product shows "van X.XX" that's the original price (strikethrough).
- Combine brand + product into the "name" field. Put size/weight info in "unitInfo", NOT in "name".
- For percentage discounts, calculate discountPercentage from the percentage shown (e.g. "25% KORTING" → 25).

Return ONLY a JSON array. No markdown, no explanation. Example:
[{"name":"Campina Yoghurt","brand":"Campina","description":"Diverse varianten","discountPrice":1.65,"originalPrice":3.30,"discountPercentage":50,"dealType":"1+1 GRATIS","unitInfo":"500 ml","isVoucher":false,"category":"zuivel"}]

If the page has no products (e.g. it's a cover page, contest page, or price comparison), return an empty array: []`;

const MAX_RETRIES = 3;

/**
 * Make a single Gemini API call. Returns raw JSON response.
 */
function callGeminiApi(url: string, requestBody: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse response: ${e}`)); }
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * Send a base64-encoded flyer page image to Gemini Flash for product extraction.
 * Automatically picks the next API key from the pool (round-robin).
 * Retries on rate limit / expired key / network errors with backoff.
 */
export async function extractProductsFromImage(
  base64Image: string,
  pageNum: number,
): Promise<GeminiPageResult> {
  const pool = getKeyPool();

  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Pick a (potentially new) key each attempt — handles expired key rotation
    const apiKey = pool.getNext();
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    try {
      const json = await callGeminiApi(url, requestBody);

      if (json.error) {
        const errMsg = json.error.message || JSON.stringify(json.error);

        // Expired or invalid key — mark and retry with different key immediately
        if (/expired|invalid.*key/i.test(errMsg) && attempt < MAX_RETRIES) {
          pool.markExpired(apiKey);
          continue;
        }

        // Quota exhausted — retry with different key after short wait
        if (/exhausted|quota/i.test(errMsg) && attempt < MAX_RETRIES) {
          console.log(`    Quota exhausted, switching key and retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Check for rate limit — parse "retry in Xs" and wait
        const retryMatch = errMsg.match(/retry in (\d+(?:\.\d+)?)s/i);
        if (retryMatch && attempt < MAX_RETRIES) {
          const waitSec = Math.ceil(parseFloat(retryMatch[1])) + 2;
          console.log(`    Rate limited, waiting ${waitSec}s (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        // Also catch "retry in Xms"
        const retryMsMatch = errMsg.match(/retry in (\d+(?:\.\d+)?)ms/i);
        if (retryMsMatch && attempt < MAX_RETRIES) {
          const waitMs = Math.ceil(parseFloat(retryMsMatch[1])) + 1000;
          console.log(`    Rate limited, waiting ${(waitMs / 1000).toFixed(1)}s (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        return { pageNum, products: [], error: `Gemini API error: ${errMsg}` };
      }

      const candidate = json.candidates?.[0];
      if (!candidate) {
        return { pageNum, products: [], error: 'No candidate in response' };
      }

      if (candidate.finishReason === 'SAFETY') {
        return { pageNum, products: [], error: 'Blocked by safety filter' };
      }

      const text = candidate.content?.parts?.[0]?.text || '';

      // Parse the JSON array from the response
      let products: GeminiProduct[] = [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          products = parseProductArray(parsed);
        }
      } catch {
        // Try to extract JSON array from text (Gemini sometimes wraps in markdown)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              products = parseProductArray(parsed);
            }
          } catch {
            return { pageNum, products: [], rawResponse: text, error: 'Failed to parse JSON from response' };
          }
        } else {
          return { pageNum, products: [], rawResponse: text, error: 'No JSON array in response' };
        }
      }

      return { pageNum, products, rawResponse: text };

    } catch (e: any) {
      if (attempt < MAX_RETRIES) {
        console.log(`    Request error, retrying in 5s (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return { pageNum, products: [], error: `Request failed: ${e.message}` };
    }
  }

  return { pageNum, products: [], error: 'Max retries exceeded' };
}

function parseProductArray(arr: any[]): GeminiProduct[] {
  return arr.map((p: any) => ({
    name: String(p.name || '').trim(),
    description: p.description ? String(p.description).trim() : null,
    brand: p.brand ? String(p.brand).trim() : null,
    discountPrice: typeof p.discountPrice === 'number' ? p.discountPrice : null,
    originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : null,
    discountPercentage: typeof p.discountPercentage === 'number' ? p.discountPercentage : null,
    dealType: p.dealType ? String(p.dealType) : null,
    unitInfo: p.unitInfo ? String(p.unitInfo).trim() : null,
    isVoucher: Boolean(p.isVoucher),
    category: p.category ? String(p.category).trim().toLowerCase() : null,
  })).filter((p: GeminiProduct) => p.name.length > 0);
}
