import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';
import type { ScrollConfig } from '../base/ScreenshotOCRScraper';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class HoogvlietScraper extends ScreenshotOCRScraper {
  constructor() { super('hoogvliet', 'https://www.hoogvliet.com/aanbiedingen'); }
  getSupermarketName() { return 'Hoogvliet'; }

  getTargetUrl() {
    return 'https://www.hoogvliet.com/aanbiedingen';
  }

  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 1280,
      viewportHeight: 600,
      overlapPercent: 0.2,
      maxChunks: 35,
      scrollDelayMs: [200, 500],
    };
  }

  /**
   * Override scrapeProducts to scrape BOTH weeks:
   * 1. Current week (default, checkbox checked)
   * 2. Upcoming week (click checkbox to switch)
   */
  async scrapeProducts(): Promise<ScrapedProduct[]> {
    // Scrape current week (default loaded)
    const week1Products = await super.scrapeProducts();
    this.logger.info(`Week 1 (current): ${week1Products.length} products`);

    // Switch to upcoming week
    try {
      const page = this.page;
      if (!page) return week1Products;

      // Find the unchecked week checkbox
      const upcomingCheckbox = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][id*="Aanbiedingen"]'));
        const unchecked = inputs.find(i => !(i as HTMLInputElement).checked);
        return unchecked ? (unchecked as HTMLInputElement).id : null;
      });

      if (!upcomingCheckbox) {
        this.logger.info('No upcoming week checkbox found — single week only');
        return week1Products;
      }

      this.logger.info(`Switching to upcoming week: ${upcomingCheckbox}`);

      // Uncheck current week, check upcoming week
      await page.evaluate((id) => {
        // Uncheck all checked week checkboxes
        const checked = Array.from(document.querySelectorAll('input[type="checkbox"][id*="Aanbiedingen"]:checked'));
        checked.forEach(cb => (cb as HTMLInputElement).click());
        // Check the upcoming week
        const upcoming = document.getElementById(id);
        if (upcoming) (upcoming as HTMLInputElement).click();
      }, upcomingCheckbox);

      await page.waitForTimeout(2000); // Wait for AJAX reload

      // Scroll to load all products for week 2
      await this.scrollToLoadAll(page);

      // Extract URLs for week 2
      const week2Urls = await this.extractProductUrls(page);

      // Capture and extract week 2
      const config = this.getScrollConfig();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // Use the base class captureScrollingScreenshots + extract
      const chunks = await this.captureScrollingScreenshots(page, config);
      if (chunks.length === 0) {
        this.logger.info('No screenshots captured for week 2');
        return week1Products;
      }

      const { GeminiExtractor, GEMINI_DEFAULTS } = await import('../../gemini');
      const { ALL_CATEGORY_SLUGS } = await import('../../config/constants');
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

      // Enrich with URLs
      this.enrichWithUrls(result.products, week2Urls);

      this.logger.info(`Week 2 (upcoming): ${result.products.length} products`);
      return [...week1Products, ...result.products];
    } catch (error) {
      this.logger.warning(`Failed to scrape upcoming week: ${error}`);
      return week1Products;
    }
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    await this.scrollToLoadAll(page);
  }

  /**
   * Gradual scroll to trigger AJAX lazy loading for all category groups.
   */
  private async scrollToLoadAll(page: Page): Promise<void> {
    let lastProductCount = 0;
    let stableRounds = 0;

    for (let i = 0; i < 80; i++) {
      await page.evaluate((step) => window.scrollBy(0, step), 400);
      await page.waitForTimeout(800);

      const productCount = await page.evaluate(
        () => document.querySelectorAll('.product-tile, [class*="product"]').length
      );

      if (productCount === lastProductCount) {
        stableRounds++;
        if (stableRounds >= 5) {
          this.logger.info(`Scroll complete: ${productCount} product elements loaded after ${i + 1} scrolls`);
          break;
        }
      } else {
        stableRounds = 0;
        lastProductCount = productCount;
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  protected getPromptHints(): string {
    return 'Hoogvliet groups products by category (e.g., "Extra voordelig", "Aardappelen, groente, fruit"). Extract all products from all categories.';
  }
}
