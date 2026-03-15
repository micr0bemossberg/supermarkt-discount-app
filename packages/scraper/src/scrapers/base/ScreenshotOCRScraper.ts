import type { Page } from 'playwright';
import { BaseScraper } from './BaseScraper';
import { GeminiExtractor, GEMINI_DEFAULTS } from '../../gemini';
import { ALL_CATEGORY_SLUGS } from '../../config/constants';
import type { ScrapedProduct, SupermarketSlug } from '@supermarkt-deals/shared';
import type { ExtractionContext, ImageChunk } from '../../gemini/types';

export interface ScrollConfig {
  viewportWidth: number;
  viewportHeight: number;
  overlapPercent: number;
  maxChunks: number;
  scrollDelayMs: [number, number];
}

const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  viewportWidth: 1280,
  viewportHeight: 800,
  overlapPercent: 0.2,
  maxChunks: 25,
  scrollDelayMs: [500, 1500],
};

export abstract class ScreenshotOCRScraper extends BaseScraper {
  private extractor: GeminiExtractor;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    super(supermarketSlug, baseUrl);
    this.extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 50 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });
  }

  /** Human-readable name for Gemini prompt context */
  abstract getSupermarketName(): string;

  /** Subclasses provide the target URL */
  abstract getTargetUrl(): string;

  /** Override for scroll behavior */
  protected getScrollConfig(): ScrollConfig {
    return DEFAULT_SCROLL_CONFIG;
  }

  /** Extra Gemini prompt context */
  protected getPromptHints(): string {
    return '';
  }

  /** Optional pre-screenshot page interaction (click "Toon meer", dismiss overlays) */
  protected async beforeScreenshots(_page: Page): Promise<void> {
    // Default: no-op
  }

  async scrapeProducts(): Promise<ScrapedProduct[]> {
    const url = this.getTargetUrl();
    const config = this.getScrollConfig();

    this.logger.info(`Starting Screenshot OCR scrape: ${url}`);

    // 1. Navigate -- initBrowser() creates this.page and returns it
    const page = await this.initBrowser();
    await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Handle cookie consent (inherited from BaseScraper)
    await this.handleCookieConsent(page);

    // 3. Pre-screenshot interaction
    try {
      await this.beforeScreenshots(page);
    } catch (error) {
      this.logger.warning(`beforeScreenshots() failed: ${error}`);
    }

    // 4. Wait for content to settle
    await page.waitForTimeout(2000);

    // 5. Capture scrolling screenshots with overlap
    const chunks = await this.captureScrollingScreenshots(page, config);
    this.logger.info(`Captured ${chunks.length} screenshot chunks`);

    if (chunks.length === 0) {
      this.logger.error('No screenshots captured');
      return [];
    }

    // 6. Send to GeminiExtractor
    const context: ExtractionContext = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    const result = await this.extractor.extractProducts(chunks, context);
    this.logger.info(
      `[${this.supermarketSlug}] Extracted ${result.products.length} products ` +
      `(${result.chunksProcessed} chunks OK, ${result.chunksFailed} failed, ${result.tokensUsed} tokens)`
    );

    // 7. Cross-chunk dedup (overlap zone)
    const deduped = this.deduplicateProducts(result.products);
    this.logger.info(`After dedup: ${deduped.length} products`);

    return deduped;
  }

  private async captureScrollingScreenshots(
    page: Page,
    config: ScrollConfig,
  ): Promise<ImageChunk[]> {
    // Measure total page height
    let totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    if (totalHeight <= 0) {
      await page.waitForTimeout(3000);
      totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    }

    if (totalHeight <= 0) return [];

    const stepSize = Math.floor(config.viewportHeight * (1 - config.overlapPercent));
    const numChunks = Math.min(
      Math.ceil(totalHeight / stepSize),
      config.maxChunks,
    );

    const chunks: ImageChunk[] = [];

    for (let i = 0; i < numChunks; i++) {
      const scrollY = i * stepSize;

      await page.evaluate((y) => window.scrollTo(0, y), scrollY);

      // Random delay between scrolls (anti-bot)
      const [minDelay, maxDelay] = config.scrollDelayMs;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      await page.waitForTimeout(delay);

      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: config.viewportWidth,
          height: config.viewportHeight,
        },
      });

      chunks.push({
        buffer: screenshot,
        index: i,
        totalChunks: numChunks,
      });
    }

    return chunks;
  }

  private deduplicateProducts(products: ScrapedProduct[]): ScrapedProduct[] {
    const seen = new Set<string>();
    const result: ScrapedProduct[] = [];

    for (const product of products) {
      const key = this.normalizeForDedup(product);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(product);
      }
    }

    return result;
  }

  private normalizeForDedup(product: ScrapedProduct): string {
    const title = product.title.toLowerCase().trim().replace(/\s+/g, ' ');
    const price = product.discount_price.toFixed(2);
    const unit = (product.unit_info || '').toLowerCase().trim();
    return `${title}|${price}|${unit}`;
  }
}
