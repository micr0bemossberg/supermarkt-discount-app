import { ScreenshotOCRScraper, type ScrollConfig } from '../base/ScreenshotOCRScraper';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class ActionScraper extends ScreenshotOCRScraper {
  constructor() { super('action', 'https://www.action.com/nl-nl/weekactie/'); }
  getSupermarketName() { return 'Action'; }

  getTargetUrl() {
    return 'https://www.action.com/nl-nl/weekactie/';
  }

  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 1280,
      viewportHeight: 600,
      overlapPercent: 0.2,
      maxChunks: 25,
      scrollDelayMs: [200, 500],
    };
  }

  protected getWaitUntil(): 'networkidle' | 'domcontentloaded' | 'load' {
    return 'domcontentloaded';
  }

  /**
   * Action uses pagination (~23 products per page, 7 pages).
   * Create extractor ONCE and reuse across all pages.
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    const allProducts: ScrapedProduct[] = [];
    const seenTitles = new Set<string>();
    const page = await this.initBrowser();
    const config = this.getScrollConfig();
    await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });

    // Create extractor once — reuse key pool across all pages
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

    for (let pageNum = 1; pageNum <= 10; pageNum++) {
      const url = pageNum === 1
        ? this.getTargetUrl()
        : `https://www.action.com/nl-nl/weekactie/?page=${pageNum}`;

      this.logger.info(`Scraping page ${pageNum}: ${url}`);
      await page.goto(url, { waitUntil: this.getWaitUntil(), timeout: 30000 });

      if (pageNum === 1) {
        await this.handleCookieConsent(page);
      }

      await page.waitForTimeout(1500);

      // Extract URLs from DOM
      const pageUrls = await this.extractProductUrls(page);

      // Capture screenshots
      const chunks = await this.captureScrollingScreenshots(page, config);
      if (chunks.length === 0) break;

      // OCR extract with shared extractor
      const result = await extractor.extractProducts(chunks, context);

      this.enrichWithUrls(result.products, pageUrls);

      // Deduplicate across pages (8 shop.action.com carousel items repeat every page)
      let newCount = 0;
      for (const p of result.products) {
        const key = p.title.toLowerCase().trim();
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allProducts.push(p);
          newCount++;
        }
      }

      this.logger.info(`Page ${pageNum}: ${result.products.length} extracted, ${newCount} new (${result.products.length - newCount} dupes)`);

      // Stop if page returned 0 new products (wrapped around to page 1)
      if (newCount === 0) {
        this.logger.info(`Page ${pageNum}: all duplicates — stopping (likely wrapped around)`);
        break;
      }

      // Check for next page link
      const hasNext = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        return links.some(a => (a as HTMLAnchorElement).href.includes('page=') && a.textContent?.includes('Volgende'));
      });

      if (!hasNext) {
        this.logger.info(`No next page after page ${pageNum}`);
        break;
      }
    }

    this.logger.info(`Total: ${allProducts.length} unique products across all pages`);
    return allProducts;
  }

  protected getThinkingLevel(): 'minimal' | 'low' | 'medium' | 'high' {
    return 'medium';
  }

  protected getPromptHints(): string {
    return 'Action sells non-food items (household, electronics, toys, personal care). Extract EVERY product card visible. Each shows: product name, price, and sometimes an original price or discount percentage.';
  }
}
