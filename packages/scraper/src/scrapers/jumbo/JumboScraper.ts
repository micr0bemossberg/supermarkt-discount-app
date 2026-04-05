import type { ScrapedProduct } from '@supermarkt-deals/shared';
import { ScreenshotOCRScraper, type ScrollConfig } from '../base/ScreenshotOCRScraper';

export class JumboScraper extends ScreenshotOCRScraper {
  constructor() { super('jumbo', 'https://www.jumbo.com/aanbiedingen/nu'); }
  getSupermarketName() { return 'Jumbo'; }

  getTargetUrl() {
    return 'https://www.jumbo.com/aanbiedingen/nu';
  }

  protected getWaitUntil(): 'networkidle' | 'domcontentloaded' | 'load' {
    return 'domcontentloaded';
  }

  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 1280,
      viewportHeight: 600,
      overlapPercent: 0.2,
      maxChunks: 15,
      scrollDelayMs: [200, 500],
    };
  }

  /**
   * Jumbo shows product GROUPS on /aanbiedingen/nu (e.g., "Johma salades", "Lipton").
   * Each group links to a detail page showing individual products.
   * Strategy: collect group URLs → visit each → screenshot + OCR the detail pages.
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    const allProducts: ScrapedProduct[] = [];
    const seenTitles = new Set<string>();
    const page = await this.initBrowser();
    const config = this.getScrollConfig();
    await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });

    // Create extractor once
    const { GeminiExtractor, GEMINI_DEFAULTS } = await import('../../gemini');
    const { ALL_CATEGORY_SLUGS } = await import('../../config/constants');
    const extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      thinkingLevel: this.getThinkingLevel(),
      apiKeys: Array.from({ length: 100 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });

    const context = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    // Step 1: Navigate to overview and collect product group URLs
    this.logger.info('Step 1: Collecting product group URLs from overview...');
    await page.goto(this.getTargetUrl(), { waitUntil: this.getWaitUntil(), timeout: 60000 });
    await page.waitForTimeout(3000);
    await this.handleCookieConsent(page);

    // Scroll to load all content
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let pos = 0; pos < totalHeight; pos += 600) {
      await page.evaluate((y) => window.scrollTo(0, y), pos);
      await page.waitForTimeout(300);
    }

    // Click carousel arrows to reveal all group links
    let totalClicks = 0;
    for (let round = 0; round < 30; round++) {
      const nextBtns = page.locator('button.next.active[aria-label="volgende"]');
      const count = await nextBtns.count();
      if (count === 0) break;
      for (let i = 0; i < count; i++) {
        try {
          await nextBtns.nth(i).scrollIntoViewIfNeeded({ timeout: 2000 });
          await nextBtns.nth(i).click({ force: true });
          totalClicks++;
        } catch {}
      }
      await page.waitForTimeout(400);
    }

    // Collect unique product group URLs
    const groupUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="/aanbiedingen/"]');
      const urls = new Set<string>();
      links.forEach(a => {
        const href = a.getAttribute('href');
        // Filter: must have slug + ID format (e.g., /aanbiedingen/johma-salades/3015236)
        if (href && href.split('/').length >= 4 && /\/\d+$/.test(href)) {
          urls.add(href);
        }
      });
      return Array.from(urls);
    });

    this.logger.info(`Found ${groupUrls.length} product groups after ${totalClicks} carousel clicks`);

    // Step 2: Visit product groups in parallel batches (4 tabs at once)
    const PARALLEL_TABS = 4;
    for (let batchStart = 0; batchStart < groupUrls.length; batchStart += PARALLEL_TABS) {
      const batch = groupUrls.slice(batchStart, batchStart + PARALLEL_TABS);
      this.logger.info(`Batch ${Math.floor(batchStart / PARALLEL_TABS) + 1}: groups ${batchStart + 1}-${batchStart + batch.length}/${groupUrls.length}`);

      // Open parallel tabs, navigate, screenshot, and collect chunks + images
      const batchResults = await Promise.allSettled(batch.map(async (groupPath, idx) => {
        const groupIdx = batchStart + idx + 1;
        const tabPage = await this.context!.newPage();
        try {
          await tabPage.goto(`https://www.jumbo.com${groupPath}`, { waitUntil: this.getWaitUntil(), timeout: 30000 });
          await tabPage.waitForTimeout(1500);
          const pageUrls = await this.extractProductUrls(tabPage);

          // Extract product images: DOM src URLs + element screenshots as fallback
          const productImages: Array<{ title: string; imageUrl: string }> = [];

          // Get card selectors and titles
          const cardInfo = await tabPage.evaluate(() => {
            const results: Array<{ title: string; imgSrc: string | null; index: number }> = [];
            const cards = document.querySelectorAll('[class*="product-card"], [data-testid*="product"], article');
            let idx = 0;
            cards.forEach(card => {
              const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="name"]');
              const img = card.querySelector('img');
              const title = (titleEl?.textContent || img?.getAttribute('alt') || '').trim();
              const imgSrc = img?.getAttribute('src') || img?.getAttribute('data-src') || null;
              if (title) {
                results.push({ title, imgSrc: (imgSrc && imgSrc.startsWith('http') && !imgSrc.includes('logo')) ? imgSrc : null, index: idx });
              }
              idx++;
            });
            return results;
          });

          // For cards with DOM image URLs, use those directly
          // For cards without, take element screenshots
          const cards = await tabPage.$$('[class*="product-card"], [data-testid*="product"], article');
          for (const info of cardInfo) {
            if (info.imgSrc) {
              productImages.push({ title: info.title, imageUrl: info.imgSrc });
            } else if (cards[info.index]) {
              try {
                const buf = await cards[info.index].screenshot({ type: 'png', timeout: 3000 });
                const webp = await (await import('sharp')).default(buf).webp({ quality: 75 }).toBuffer();
                productImages.push({ title: info.title, imageUrl: `data:image/webp;base64,${webp.toString('base64')}` });
              } catch {}
            }
          }

          const chunks = await this.captureScrollingScreenshots(tabPage, config);
          return { groupIdx, groupPath, pageUrls, chunks, productImages };
        } finally {
          await tabPage.close();
        }
      }));

      // Collect all chunks from successful tabs into one batch for Gemini
      const allChunks: import('../../gemini/types').ImageChunk[] = [];
      const chunkMeta: Array<{ groupIdx: number; groupPath: string; pageUrls: any[]; chunkStart: number; chunkCount: number }> = [];

      // Collect DOM images from all tabs
      const allDomImages: Array<{ title: string; imageUrl: string }> = [];

      for (const result of batchResults) {
        if (result.status === 'rejected') continue;
        const { groupIdx, groupPath, pageUrls, chunks, productImages } = result.value;
        if (chunks.length === 0) continue;
        const chunkStart = allChunks.length;
        for (const c of chunks) {
          allChunks.push({ buffer: c.buffer, index: allChunks.length, totalChunks: 0 });
        }
        chunkMeta.push({ groupIdx, groupPath, pageUrls, chunkStart, chunkCount: chunks.length });
        allDomImages.push(...productImages);
      }

      if (allChunks.length === 0) continue;
      for (const c of allChunks) c.totalChunks = allChunks.length;

      // Single Gemini call for entire batch
      const result = await extractor.extractProducts(allChunks, context);
      await this.cropProductImages(result.products, allChunks);

      // Enrich with URLs from all groups in this batch
      const allPageUrls = chunkMeta.flatMap(m => m.pageUrls);
      this.enrichWithUrls(result.products, allPageUrls);

      // Enrich with DOM images — fuzzy match OCR title to DOM image title
      if (allDomImages.length > 0) {
        let imgMatched = 0;
        for (const p of result.products) {
          if (p.image_url) continue; // Already has image from bbox crop
          const pTitle = p.title.toLowerCase().trim();
          let bestMatch: { title: string; imageUrl: string } | null = null;
          let bestScore = 0;
          for (const img of allDomImages) {
            const imgTitle = img.title.toLowerCase().trim();
            // Simple overlap score
            if (pTitle === imgTitle) { bestMatch = img; bestScore = 1; break; }
            if (pTitle.includes(imgTitle) || imgTitle.includes(pTitle)) {
              const score = Math.min(pTitle.length, imgTitle.length) / Math.max(pTitle.length, imgTitle.length);
              if (score > bestScore) { bestScore = score; bestMatch = img; }
            }
          }
          if (bestMatch && bestScore >= 0.4) {
            p.image_url = bestMatch.imageUrl;
            imgMatched++;
          }
        }
        if (imgMatched > 0) this.logger.info(`Matched ${imgMatched} DOM images to products`);
      }

      // Dedup
      let batchNew = 0;
      for (const p of result.products) {
        const key = p.title.toLowerCase().trim();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allProducts.push(p);
          batchNew++;
        }
      }

      this.logger.info(`Batch: ${result.products.length} extracted, ${batchNew} new (total: ${allProducts.length})`);
    }

    this.logger.info(`Total: ${allProducts.length} unique products from ${groupUrls.length} groups`);
    return allProducts;
  }

  protected getThinkingLevel(): 'minimal' | 'low' | 'medium' | 'high' {
    return 'medium';
  }

  protected getPromptHints(): string {
    return `Jumbo supermarket product group detail page.
Shows the deal (e.g., "3 voor 6,00", "1+1 gratis", "25% korting") at the top,
followed by individual products that qualify for the deal.
Extract EVERY individual product with its name, weight/unit, and the deal price.
Products with "Extra's" badge require a Jumbo loyalty card — mark requires_card=true.`;
  }
}
