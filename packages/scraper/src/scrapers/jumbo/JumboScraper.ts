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

    // Step 2: Visit each product group detail page → screenshot → OCR
    for (let i = 0; i < groupUrls.length; i++) {
      const groupUrl = `https://www.jumbo.com${groupUrls[i]}`;
      this.logger.info(`Group ${i + 1}/${groupUrls.length}: ${groupUrls[i]}`);

      try {
        await page.goto(groupUrl, { waitUntil: this.getWaitUntil(), timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract product URLs from this detail page
        const pageUrls = await this.extractProductUrls(page);

        // Screenshot the detail page
        const chunks = await this.captureScrollingScreenshots(page, config);
        if (chunks.length === 0) continue;

        // OCR
        const result = await extractor.extractProducts(chunks, context);
        this.enrichWithUrls(result.products, pageUrls);

        // Dedup across all groups
        let newCount = 0;
        for (const p of result.products) {
          const key = p.title.toLowerCase().trim();
          if (!seenTitles.has(key)) {
            seenTitles.add(key);
            allProducts.push(p);
            newCount++;
          }
        }

        this.logger.info(`Group ${i + 1}: ${result.products.length} extracted, ${newCount} new`);
      } catch (e) {
        this.logger.warning(`Group ${i + 1} failed: ${e instanceof Error ? e.message.substring(0, 100) : e}`);
      }
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
