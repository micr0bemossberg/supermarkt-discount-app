/**
 * Extract page image URLs from Publitas spreads.json data.
 * Also handles downloading images as base64 for OCR processing.
 */

import * as https from 'https';
import * as http from 'http';

const PUBLITAS_CDN_BASE = 'https://view.publitas.com';

export interface PublitasPage {
  pageNum: number;
  text: string;
  imageUrl: string;       // Full URL to page image (at1600 resolution)
  imageUrlHigh: string;   // Full URL to page image (at2400 resolution)
  screenshotUrl: string;  // Full URL to rendered screenshot
}

/**
 * Extract page info including image URLs from raw spreads.json data.
 * @param spreadsData Raw spreads.json array
 * @param resolution Which resolution to use for primary imageUrl (default: 'at1600')
 */
export function extractPages(spreadsData: any[], resolution: string = 'at1600'): PublitasPage[] {
  const pages: PublitasPage[] = [];

  for (const spread of spreadsData) {
    if (!spread?.pages) continue;

    for (const page of spread.pages) {
      const pageNum = page.number || 0;
      const text = page.text || '';

      // Build image URLs from the images object
      const images = page.images || {};
      const imagePath = images[resolution] || images.at1600 || images.at1200 || '';
      const imagePathHigh = images.at2400 || images.at2000 || imagePath;

      // Build screenshot URL (signed, may expire)
      const screenshots = page.screenshots || {};
      const screenshotPath = screenshots[resolution] || screenshots.at1600 || '';

      pages.push({
        pageNum,
        text: text.trim(),
        imageUrl: imagePath ? `${PUBLITAS_CDN_BASE}${imagePath}` : '',
        imageUrlHigh: imagePathHigh ? `${PUBLITAS_CDN_BASE}${imagePathHigh}` : '',
        screenshotUrl: screenshotPath ? `${PUBLITAS_CDN_BASE}${screenshotPath}` : '',
      });
    }
  }

  return pages.sort((a, b) => a.pageNum - b.pageNum);
}

/**
 * Download an image from a URL and return it as a base64 string.
 * Follows redirects (up to 5).
 */
export async function downloadImageAsBase64(imageUrl: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;

    const doRequest = (url: string, redirectsLeft: number) => {
      protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*',
          'Referer': 'https://view.publitas.com/',
        },
      }, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${imageUrl}`));
            return;
          }
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${PUBLITAS_CDN_BASE}${res.headers.location}`;
          doRequest(redirectUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.toString('base64'));
        });
        res.on('error', reject);
      }).on('error', reject);
    };

    doRequest(imageUrl, maxRedirects);
  });
}

/**
 * Download multiple page images as base64, with rate limiting.
 * @param pages Pages to download images for
 * @param delayMs Delay between downloads to avoid rate limiting (default: 500ms)
 * @param useHighRes Whether to use high-res images (default: false, uses at1600)
 */
export async function downloadPageImages(
  pages: PublitasPage[],
  delayMs = 500,
  useHighRes = false,
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  for (const page of pages) {
    const url = useHighRes ? page.imageUrlHigh : page.imageUrl;
    if (!url) {
      console.warn(`  Page ${page.pageNum}: No image URL available`);
      continue;
    }

    try {
      console.log(`  Downloading page ${page.pageNum} image...`);
      const base64 = await downloadImageAsBase64(url);
      results.set(page.pageNum, base64);

      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch (err: any) {
      console.warn(`  Page ${page.pageNum}: Failed to download - ${err.message}`);
    }
  }

  return results;
}
