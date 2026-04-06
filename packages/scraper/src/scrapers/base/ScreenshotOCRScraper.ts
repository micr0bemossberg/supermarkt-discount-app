import type { Page } from 'playwright';
import { BaseScraper } from './BaseScraper';
import { GeminiExtractor, GEMINI_DEFAULTS } from '../../gemini';
import { ALL_CATEGORY_SLUGS } from '../../config/constants';
import type { ScrapedProduct, SupermarketSlug } from '@supermarkt-deals/shared';
import type { ExtractionContext, ImageChunk } from '../../gemini/types';

export interface DomProductLink {
  text: string;
  url: string;
}

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
  scrollDelayMs: [200, 500],
};

export abstract class ScreenshotOCRScraper extends BaseScraper {
  private _extractor: GeminiExtractor | null = null;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    super(supermarketSlug, baseUrl);
  }

  /** Lazy-initialized extractor — allows subclass overrides of getThinkingLevel() */
  protected get extractor(): GeminiExtractor {
    if (!this._extractor) {
      this._extractor = new GeminiExtractor({
        ...GEMINI_DEFAULTS,
        thinkingLevel: this.getThinkingLevel(),
        apiKeys: Array.from({ length: 100 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
          .filter((k): k is string => !!k),
      });
    }
    return this._extractor;
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

  /** Override for sites that don't reach networkidle (continuous background requests) */
  protected getWaitUntil(): 'networkidle' | 'domcontentloaded' | 'load' {
    return 'networkidle';
  }

  /** Override thinking level per scraper. Dense grids benefit from 'medium' (fewer timeouts). */
  protected getThinkingLevel(): 'minimal' | 'low' | 'medium' | 'high' {
    return GEMINI_DEFAULTS.thinkingLevel;
  }

  /** Override to provide additional image chunks (e.g., modal screenshots). */
  protected getExtraChunks(): ImageChunk[] {
    return [];
  }

  /**
   * Test-OCR override: capture only 1 screenshot chunk, send to Gemini, return raw products.
   */
  public async runTestOcr(): Promise<ScrapedProduct[]> {
    this.startTime = Date.now();
    const url = this.getTargetUrl();
    const config = this.getScrollConfig();

    this.logger.info(`[TEST-OCR] Starting Screenshot OCR test: ${url}`);

    try {
      const page = await this.initBrowser();
      await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });
      await page.goto(url, { waitUntil: this.getWaitUntil(), timeout: 30000 });
      await this.handleCookieConsent(page);

      try {
        await this.beforeScreenshots(page);
      } catch (error) {
        this.logger.warning(`beforeScreenshots() failed: ${error}`);
      }

      // Extract product URLs from DOM before screenshots
      this.lastExtractedUrls = await this.extractProductUrls(page);

      await page.waitForTimeout(500);

      // Capture only 1 screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: config.viewportWidth,
          height: config.viewportHeight,
        },
      });

      const chunks: ImageChunk[] = [{
        buffer: screenshot,
        index: 0,
        totalChunks: 1,
      }];

      // Include extra chunks (e.g., Dirk modal screenshots)
      const extraChunks = this.getExtraChunks();
      if (extraChunks.length > 0) {
        chunks.push(...extraChunks);
      }

      this.logger.info(`[TEST-OCR] Captured 1 screenshot chunk + ${extraChunks.length} extra chunks`);

      const context: ExtractionContext = {
        supermarketSlug: this.supermarketSlug,
        supermarketName: this.getSupermarketName(),
        categorySlugList: ALL_CATEGORY_SLUGS,
        promptHints: this.getPromptHints(),
      };

      const result = await this.extractor.extractProducts(chunks, context);
      this.logger.info(
        `[TEST-OCR] Extracted ${result.products.length} products ` +
        `(${result.tokensUsed} tokens)`
      );

      // Enrich with URLs from DOM
      this.enrichWithUrls(result.products, this.lastExtractedUrls);

      return result.products;
    } finally {
      await this.cleanup();
      const endTime = Date.now();
      this.logger.info(`[TEST-OCR] Duration: ${Math.round((endTime - this.startTime) / 1000)}s`);
    }
  }

  async scrapeProducts(): Promise<ScrapedProduct[]> {
    const url = this.getTargetUrl();
    const config = this.getScrollConfig();

    this.logger.info(`Starting Screenshot OCR scrape: ${url}`);

    // 1. Navigate -- initBrowser() creates this.page and returns it
    const page = await this.initBrowser();
    await page.setViewportSize({ width: config.viewportWidth, height: config.viewportHeight });
    await page.goto(url, { waitUntil: this.getWaitUntil(), timeout: 30000 });

    // 2. Handle cookie consent (inherited from BaseScraper)
    await this.handleCookieConsent(page);

    // 3. Pre-screenshot interaction
    try {
      await this.beforeScreenshots(page);
    } catch (error) {
      this.logger.warning(`beforeScreenshots() failed: ${error}`);
    }

    // 4. Extract product URLs from DOM (before screenshots scroll the page)
    this.lastExtractedUrls = await this.extractProductUrls(page);

    // 5. Brief settle after interactions
    await page.waitForTimeout(500);

    // 6. Capture scrolling screenshots with overlap
    const chunks = await this.captureScrollingScreenshots(page, config);

    // 6b. Merge any extra chunks (e.g., modal screenshots from Dirk)
    const extraChunks = this.getExtraChunks();
    if (extraChunks.length > 0) {
      chunks.push(...extraChunks);
      this.logger.info(`Captured ${chunks.length - extraChunks.length} scroll chunks + ${extraChunks.length} extra chunks`);
    } else {
      this.logger.info(`Captured ${chunks.length} screenshot chunks`);
    }

    if (chunks.length === 0) {
      this.logger.error('No screenshots captured');
      return [];
    }

    // 7. Send to GeminiExtractor
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

    // 8. Cross-chunk dedup (overlap zone)
    const deduped = this.deduplicateProducts(result.products);
    this.logger.info(`After dedup: ${deduped.length} products`);

    // 9. Enrich products with URLs extracted from DOM
    this.enrichWithUrls(deduped, this.lastExtractedUrls);

    // 10. Crop individual product images from screenshots using bounding boxes
    await this.cropProductImages(deduped, chunks);

    return deduped;
  }

  /**
   * Extract product-like links from the page DOM.
   * Returns an array of { text, url } for all <a> elements that look like product links.
   * Uses broad heuristics to work across different supermarket sites.
   */
  protected async extractProductUrls(page: Page): Promise<DomProductLink[]> {
    try {
      const links = await page.evaluate(() => {
        const results: { text: string; url: string }[] = [];
        const seen = new Set<string>();

        const skipPatterns = [
          '/login', '/register', '/cart', '/winkelwagen', '/account',
          '/privacy', '/cookie', '/voorwaarden', '/contact',
          'facebook.com', 'twitter.com', 'instagram.com',
          'youtube.com', 'linkedin.com', 'mailto:', 'tel:',
        ];

        const anchors = Array.from(document.querySelectorAll('a[href]'));
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href;
          if (!href || href === '#' || href.startsWith('javascript:')) continue;

          const hrefLower = href.toLowerCase();
          if (skipPatterns.some(p => hrefLower.includes(p))) continue;

          // Get visible text content, cleaned up
          let text = (anchor as HTMLElement).innerText || '';
          text = text.replace(/\s+/g, ' ').trim();

          // For links with no text, extract product name from URL path
          // e.g., /boodschappen/.../1%20de%20beste%20ijsbergsla%20melange/43355
          if (text.length < 2) {
            try {
              const pathParts = new URL(href).pathname.split('/').filter(Boolean);
              // Take the second-to-last segment (product name), skip the numeric ID at the end
              const namePart = pathParts.length >= 2
                ? pathParts[pathParts.length - 2]
                : pathParts[pathParts.length - 1];
              if (namePart && !/^\d+$/.test(namePart)) {
                text = decodeURIComponent(namePart).replace(/[+%]/g, ' ').replace(/\s+/g, ' ').trim();
              }
            } catch {}
          }

          if (text.length < 2) continue;
          if (seen.has(href)) continue;
          seen.add(href);

          results.push({ text, url: href });
        }

        return results;
      });

      this.logger.info(`Extracted ${links.length} product-like links from DOM`);
      return links;
    } catch (error) {
      this.logger.warning(`Failed to extract product URLs from DOM: ${error}`);
      return [];
    }
  }

  /**
   * Enrich OCR-extracted products with URLs from the DOM.
   * Uses fuzzy title matching: normalizes both strings and checks for substring overlap.
   */
  protected enrichWithUrls(products: ScrapedProduct[], domLinks: DomProductLink[]): ScrapedProduct[] {
    if (domLinks.length === 0) return products;

    // Pre-normalize all DOM link texts for matching
    const normalizedLinks = domLinks.map(link => ({
      ...link,
      normalizedText: this.normalizeForUrlMatch(link.text),
    }));

    let matchCount = 0;

    for (const product of products) {
      // Skip products that already have a URL (e.g., from OCR or API)
      if (product.product_url) continue;

      const normalizedTitle = this.normalizeForUrlMatch(product.title);
      if (normalizedTitle.length < 2) continue;

      let bestMatch: (typeof normalizedLinks)[number] | null = null;
      let bestScore = 0;

      for (const link of normalizedLinks) {
        if (link.normalizedText.length < 2) continue;

        // Match against link text
        let score = this.urlMatchScore(normalizedTitle, link.normalizedText);

        // Also try matching against URL path (e.g., /1%20de%20beste%20ijsbergsla%20melange/)
        try {
          const pathParts = new URL(link.url).pathname.split('/').filter(Boolean);
          const namePart = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : '';
          if (namePart && !/^\d+$/.test(namePart)) {
            const normalizedPath = this.normalizeForUrlMatch(decodeURIComponent(namePart));
            const pathScore = this.urlMatchScore(normalizedTitle, normalizedPath);
            score = Math.max(score, pathScore);
          }
        } catch {}

        if (score > bestScore) {
          bestScore = score;
          bestMatch = link;
        }
      }

      // Threshold 0.35 — lower than before (0.5) to catch more partial matches
      // Reject category/listing pages — never valid product destinations
      const isCategoryPage = bestMatch ? /\/product-categorie\/|\/categorie\/|\/category\//.test(bestMatch.url) : false;
      if (bestMatch && bestScore >= 0.35 && !isCategoryPage) {
        product.product_url = bestMatch.url;
        matchCount++;
      }
    }

    this.logger.info(`URL enrichment: matched ${matchCount}/${products.length} products`);
    return products;
  }

  /**
   * Normalize a string for URL matching: lowercase, remove diacritics, trim, collapse whitespace.
   */
  private normalizeForUrlMatch(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, ' ')    // Replace non-alphanumeric with space
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Compute a matching score between an OCR product title and a DOM link text.
   * Returns a value between 0 (no match) and 1 (perfect match).
   *
   * Strategy:
   * 1. Exact match → 1.0
   * 2. One fully contains the other → 0.9
   * 3. Word overlap (Jaccard-like) → proportional score
   */
  private urlMatchScore(normalizedTitle: string, normalizedLinkText: string): number {
    // Exact match
    if (normalizedTitle === normalizedLinkText) return 1.0;

    // Containment: one string fully inside the other
    if (normalizedTitle.includes(normalizedLinkText) || normalizedLinkText.includes(normalizedTitle)) {
      // Scale by length ratio to prefer better-fitting matches
      const shorter = Math.min(normalizedTitle.length, normalizedLinkText.length);
      const longer = Math.max(normalizedTitle.length, normalizedLinkText.length);
      // At least 0.7 for any containment, higher for closer lengths
      return 0.7 + 0.2 * (shorter / longer);
    }

    // Word-level overlap (Jaccard similarity on words)
    const titleWords = new Set(normalizedTitle.split(' ').filter(w => w.length > 1));
    const linkWords = new Set(normalizedLinkText.split(' ').filter(w => w.length > 1));

    if (titleWords.size === 0 || linkWords.size === 0) return 0;

    let intersection = 0;
    for (const word of titleWords) {
      if (linkWords.has(word)) intersection++;
    }

    if (intersection === 0) return 0;

    const union = new Set([...titleWords, ...linkWords]).size;
    const jaccard = intersection / union;

    // Also consider what fraction of the product title words matched
    const titleCoverage = intersection / titleWords.size;

    // Weighted: 60% title coverage (how much of the product name matched),
    // 40% Jaccard (overall similarity)
    return 0.6 * titleCoverage + 0.4 * jaccard;
  }

  /** Stored DOM links from the most recent page, available for subclass overrides */
  protected lastExtractedUrls: DomProductLink[] = [];

  protected async captureScrollingScreenshots(
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
