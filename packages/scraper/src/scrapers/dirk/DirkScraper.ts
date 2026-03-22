import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';
import type { ImageChunk } from '../../gemini/types';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class DirkScraper extends ScreenshotOCRScraper {
  constructor() { super('dirk', 'https://www.dirk.nl/aanbiedingen'); }
  getSupermarketName() { return 'Dirk van den Broek'; }

  getTargetUrl() {
    return 'https://www.dirk.nl/aanbiedingen';
  }

  /**
   * Override scrapeProducts to scrape BOTH tabs:
   * 1. "Aanbiedingen tot en met dinsdag" (default, already loaded)
   * 2. "Aanbiedingen vanaf woensdag" (click tab to load)
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    // Scrape first tab (default loaded)
    this.multiProductScreenshots = [];
    const tab1Products = await super.scrapeProducts();
    this.logger.info(`Tab 1 (t/m dinsdag): ${tab1Products.length} products`);

    // Click "Vanaf woensdag" tab and scrape again
    try {
      const page = this.page;
      if (!page) return tab1Products;

      const upcomingTab = page.locator('button.upcoming');
      if (await upcomingTab.count() === 0) {
        this.logger.info('No "vanaf woensdag" tab found — single tab only');
        return tab1Products;
      }

      this.logger.info('Switching to "Aanbiedingen vanaf woensdag" tab...');
      await upcomingTab.click({ timeout: 3000 });
      await page.waitForTimeout(1500); // Wait for new products to load

      // Reset modal screenshots for tab 2
      this.multiProductScreenshots = [];

      // Expand multi-product modals on this tab too
      await this.expandMultiProductModals(page);

      // Extract product URLs from DOM for tab 2
      const tab2Urls = await this.extractProductUrls(page);

      // Capture scrolling screenshots of tab 2 content
      const config = this.getScrollConfig();
      const tab2Result = await this.captureAndExtractTab(page, config);
      const tab2Products = tab2Result.buildContextAndExtract;

      // Enrich tab 2 products with URLs
      this.enrichWithUrls(tab2Products, tab2Urls);

      this.logger.info(`Tab 2 (vanaf woensdag): ${tab2Products.length} products`);

      return [...tab1Products, ...tab2Products];
    } catch (error) {
      this.logger.warning(`Failed to scrape "vanaf woensdag" tab: ${error}`);
      return tab1Products;
    }
  }

  /**
   * Also override runTestOcr to scrape both tabs in test mode.
   */
  public async runTestOcr(): Promise<ScrapedProduct[]> {
    // Use the full scrapeProducts which handles both tabs
    this.startTime = Date.now();
    try {
      const page = await this.initBrowser();
      const config = this.getScrollConfig();
      await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });
      await page.goto(this.getTargetUrl(), { waitUntil: 'networkidle', timeout: 30000 });
      await this.handleCookieConsent(page);

      const products = await this.scrapeProducts();

      this.logger.info(`[TEST-OCR] Total: ${products.length} products from both tabs`);
      return products;
    } finally {
      await this.cleanup();
      const endTime = Date.now();
      this.logger.info(`[TEST-OCR] Duration: ${Math.round((endTime - this.startTime) / 1000)}s`);
    }
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    await this.expandMultiProductModals(page);
  }

  /**
   * Expand all multi-product cards on the current page view.
   * Uses direct DOM clicks for speed (~1s per card).
   */
  private async expandMultiProductModals(page: Page): Promise<void> {
    const elements = await page.$$('article .middle-item.multi-product');
    if (elements.length === 0) return;

    this.logger.info(`Found ${elements.length} multi-product cards — expanding`);

    for (let i = 0; i < elements.length; i++) {
      try {
        await elements[i].evaluate(el => {
          el.scrollIntoView({ block: 'center' });
          (el as HTMLElement).click();
        });

        await page.waitForSelector('.overlay', { state: 'visible', timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(150);

        this.multiProductScreenshots.push(await page.screenshot({ type: 'png' }));

        await page.evaluate(() => {
          (document.querySelector('button.close[aria-label="Sluiten"]') as HTMLElement)?.click();
        });

        await page.waitForSelector('.overlay', { state: 'hidden', timeout: 800 }).catch(() => {});
      } catch {
        await page.evaluate(() => {
          (document.querySelector('button.close[aria-label="Sluiten"]') as HTMLElement)?.click();
        }).catch(() => {});
        await page.waitForTimeout(100);
      }
    }

    this.logger.info(`Captured ${this.multiProductScreenshots.length} modal screenshots`);
  }

  /**
   * Capture screenshots and extract products for the currently visible tab.
   */
  private async captureAndExtractTab(page: Page, config: ReturnType<typeof this.getScrollConfig>) {
    const { GeminiExtractor, GEMINI_DEFAULTS } = await import('../../gemini');
    const { ALL_CATEGORY_SLUGS } = await import('../../config/constants');

    // Capture scrolling screenshots
    const scrollStepSize = Math.floor(config.viewportHeight * (1 - config.overlapPercent));
    const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const numChunks = Math.min(Math.ceil(totalHeight / scrollStepSize), config.maxChunks);

    const chunks: import('../../gemini/types').ImageChunk[] = [];
    for (let i = 0; i < numChunks; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * scrollStepSize);
      const [minDelay, maxDelay] = config.scrollDelayMs;
      await page.waitForTimeout(minDelay + Math.random() * (maxDelay - minDelay));

      chunks.push({
        buffer: await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: config.viewportWidth, height: config.viewportHeight } }),
        index: i,
        totalChunks: numChunks,
      });
    }

    // Add modal screenshots
    chunks.push(...this.getExtraChunks());

    // Extract
    const extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 50 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });

    const result = await extractor.extractProducts(chunks, {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    });

    return { captureScrollingScreenshots: chunks, buildContextAndExtract: result.products };
  }

  private multiProductScreenshots: Buffer[] = [];

  protected getExtraChunks(): ImageChunk[] {
    return this.multiProductScreenshots.map((buffer, i) => ({
      buffer,
      index: 1000 + i,
      totalChunks: this.multiProductScreenshots.length,
    }));
  }

  protected getPromptHints(): string {
    return `Dirk uses expandable product cards. Some images show a modal overlay with product variants — extract ALL variants shown.
Look carefully for "van X.XX" text near prices — this shows the original price.
Also look for weight/unit info below product names (e.g., "500 g", "Per schaal.", "1,5 kg").`;
  }
}
