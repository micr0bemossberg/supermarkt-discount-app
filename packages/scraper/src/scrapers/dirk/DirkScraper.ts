import type { Page } from 'playwright';
import sharp from 'sharp';
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
   * Override scrapeProducts to scrape BOTH tabs with composite modals:
   * 1. "Aanbiedingen tot en met dinsdag" (default, already loaded)
   * 2. "Aanbiedingen vanaf woensdag" (click tab to load)
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    // Scrape first tab — super.scrapeProducts() calls beforeScreenshots() which
    // expands modals. getExtraChunks() returns [] since we build composites in
    // captureAndExtractTab() instead.
    this.multiProductScreenshots = [];
    const tab1Products = await super.scrapeProducts();

    // PARALLEL: Start modal Gemini extraction while we navigate to tab 2
    const { GeminiExtractor, GEMINI_DEFAULTS } = await import('../../gemini');
    const { ALL_CATEGORY_SLUGS } = await import('../../config/constants');
    const makeExtractor = () => new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 100 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });
    const context = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    // Fire off modal extraction in background (doesn't need browser)
    let modalPromise: Promise<ScrapedProduct[]> = Promise.resolve([]);
    if (this.multiProductScreenshots.length > 0) {
      const composites = await this.buildCompositeChunks();
      if (composites.length > 0) {
        modalPromise = (async () => {
          const result = await makeExtractor().extractProducts(composites, context);
          this.logger.info(`Tab 1 modals: ${result.products.length} products from ${composites.length} composites`);
          await this.cropProductImages(result.products, composites);
          return result.products;
        })();
      }
    }

    // MEANWHILE: Navigate to tab 2 and capture screenshots (browser work)
    let tab2Products: ScrapedProduct[] = [];
    try {
      const page = this.page;
      if (page) {
        const upcomingTab = page.locator('button.upcoming');
        if (await upcomingTab.count() > 0) {
          this.logger.info('Switching to "Aanbiedingen vanaf woensdag" tab...');
          await upcomingTab.click({ timeout: 3000 });
          await page.waitForTimeout(1500);

          this.multiProductScreenshots = [];
          this.modalProductLinks = [];

          await this.expandMultiProductModals(page);
          const tab2Urls = await this.extractProductUrls(page);
          const config = this.getScrollConfig();
          const tab2Result = await this.captureAndExtractTab(page, config);
          tab2Products = tab2Result.buildContextAndExtract;
          this.enrichWithUrls(tab2Products, tab2Urls);
          this.logger.info(`Tab 2 (vanaf woensdag): ${tab2Products.length} products`);
        } else {
          this.logger.info('No "vanaf woensdag" tab found — single tab only');
        }
      }
    } catch (error) {
      this.logger.warning(`Failed to scrape "vanaf woensdag" tab: ${error}`);
    }

    // Wait for modal extraction to finish (was running in parallel with tab 2 browser work)
    const modalProducts = await modalPromise;
    tab1Products.push(...modalProducts);
    this.logger.info(`Tab 1 (t/m dinsdag): ${tab1Products.length} products`);

    return [...tab1Products, ...tab2Products];
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

  /** Slower scrolling for Dirk — product images lazy-load with fade transitions */
  protected getScrollConfig() {
    return {
      viewportWidth: 1280,
      viewportHeight: 800,
      overlapPercent: 0.2,
      maxChunks: 30,
      scrollDelayMs: [800, 1200] as [number, number],  // 800-1200ms (was 200-500ms)
    };
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    this.modalProductLinks = [];
    await this.expandMultiProductModals(page);
  }

  /**
   * Override: merge page links with modal overlay links for better URL coverage.
   */
  protected async extractProductUrls(page: import('playwright').Page) {
    const pageLinks = await super.extractProductUrls(page);
    // Merge modal links (deduplicate by URL)
    const seenUrls = new Set(pageLinks.map(l => l.url));
    for (const link of this.modalProductLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        pageLinks.push(link);
      }
    }
    this.logger.info(`Total links after modal merge: ${pageLinks.length} (${this.modalProductLinks.length} from modals)`);
    return pageLinks;
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

        // Extract product links from the open modal overlay
        const modalLinks = await page.evaluate(() => {
          const overlay = document.querySelector('.overlay');
          if (!overlay) return [];
          const anchors = overlay.querySelectorAll('a[href]');
          return Array.from(anchors)
            .map(a => ({ text: (a as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), url: (a as HTMLAnchorElement).href }))
            .filter(l => l.text.length > 1 && l.url.includes('boodschappen'));
        });
        this.modalProductLinks.push(...modalLinks);

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

    this.logger.info(`Captured ${this.multiProductScreenshots.length} modal screenshots, ${this.modalProductLinks.length} modal links`);
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

      // Wait for all visible images to finish loading (prevents transparent/ghosting)
      await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        return Promise.all(Array.from(imgs).filter(img => !img.complete).map(img =>
          new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 2000); })
        ));
      });

      chunks.push({
        buffer: await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: config.viewportWidth, height: config.viewportHeight } }),
        index: i,
        totalChunks: numChunks,
      });
    }

    // Add composite modal screenshots (6 modals per image)
    const compositeChunks = await this.buildCompositeChunks();
    chunks.push(...compositeChunks);

    // Extract
    const extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 100 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });

    const result = await extractor.extractProducts(chunks, {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    });

    // Crop product images from screenshots
    await this.cropProductImages(result.products, chunks);

    return { captureScrollingScreenshots: chunks, buildContextAndExtract: result.products };
  }

  private multiProductScreenshots: Buffer[] = [];
  private modalProductLinks: { text: string; url: string }[] = [];
  private static MODALS_PER_COMPOSITE = 6;

  /**
   * Combine individual modal screenshots into composite images.
   * 6 modals per composite = 74 modals → 13 API calls (instead of 74).
   */
  protected getExtraChunks(): ImageChunk[] {
    // Will be replaced by async version in scrapeProducts
    return [];
  }

  private async buildCompositeChunks(): Promise<ImageChunk[]> {
    if (this.multiProductScreenshots.length === 0) return [];

    const composites: ImageChunk[] = [];
    const perGroup = DirkScraper.MODALS_PER_COMPOSITE;
    const totalGroups = Math.ceil(this.multiProductScreenshots.length / perGroup);

    this.logger.info(`Combining ${this.multiProductScreenshots.length} modals into ${totalGroups} composite images (${perGroup} per image)`);

    for (let g = 0; g < totalGroups; g++) {
      const group = this.multiProductScreenshots.slice(g * perGroup, (g + 1) * perGroup);

      // Get dimensions of each image in the group
      const metas = await Promise.all(group.map(buf => sharp(buf).metadata()));
      const maxWidth = Math.max(...metas.map(m => m.width || 800));
      const totalHeight = metas.reduce((sum, m) => sum + (m.height || 600), 0);

      // Stack vertically
      const composite = sharp({
        create: {
          width: maxWidth,
          height: totalHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      });

      let yOffset = 0;
      const overlays: sharp.OverlayOptions[] = [];
      for (let i = 0; i < group.length; i++) {
        overlays.push({ input: group[i], top: yOffset, left: 0 });
        yOffset += metas[i].height || 600;
      }

      const buffer = await composite.composite(overlays).png().toBuffer();
      composites.push({
        buffer,
        index: 1000 + g,
        totalChunks: totalGroups,
      });
    }

    return composites;
  }

  protected getPromptHints(): string {
    return `Dirk uses expandable product cards. Some images show a modal overlay with product variants — extract ALL variants shown.
Look carefully for "van X.XX" text near prices — this shows the original price.
Also look for weight/unit info below product names (e.g., "500 g", "Per schaal.", "1,5 kg").`;
  }
}
