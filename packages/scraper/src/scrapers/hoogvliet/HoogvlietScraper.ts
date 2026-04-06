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

      // Find the unchecked week checkbox and its label text (contains the date range)
      const upcomingInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][id*="Aanbiedingen"]'));
        const unchecked = inputs.find(i => !(i as HTMLInputElement).checked) as HTMLInputElement | undefined;
        if (!unchecked) return null;
        const label = document.querySelector(`label[for="${unchecked.id}"]`);
        const labelText = label?.textContent?.trim() ?? unchecked.id;
        return { id: unchecked.id, labelText };
      });

      if (!upcomingInfo) {
        this.logger.info('No upcoming week checkbox found — single week only');
        return week1Products;
      }

      const upcomingCheckbox = upcomingInfo.id;
      this.logger.info(`Switching to upcoming week: ${upcomingInfo.labelText}`);

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

      // Override week 2 dates from the checkbox label text (e.g. "08 april - 14 april")
      const week2Dates = this.parseDutchDateRange(upcomingInfo.labelText);
      if (week2Dates) {
        for (const p of result.products) {
          p.valid_from = new Date(week2Dates.validFrom);
          p.valid_until = new Date(week2Dates.validUntil);
        }
        this.logger.info(`Week 2 dates overridden: ${week2Dates.validFrom} → ${week2Dates.validUntil}`);
      } else {
        this.logger.warning(`Could not parse week 2 dates from label: "${upcomingInfo.labelText}"`);
      }

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

  /**
   * Parse a Dutch date range like "08 april - 14 april" from a label string.
   * Returns valid_from (start of first day, midnight CET) and valid_until (end of last day, 23:59:59 CET).
   * Uses +02:00 (CEST) for Apr-Oct, +01:00 (CET) for Nov-Mar.
   */
  private parseDutchDateRange(text: string): { validFrom: string; validUntil: string } | null {
    const DUTCH_MONTHS: Record<string, number> = {
      januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
      juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
    };
    const match = text.match(/(\d{1,2})\s+([a-z]+)\s*[-–]\s*(\d{1,2})\s+([a-z]+)/i);
    if (!match) return null;
    const [, d1, m1, d2, m2] = match;
    const month1 = DUTCH_MONTHS[m1.toLowerCase()];
    const month2 = DUTCH_MONTHS[m2.toLowerCase()];
    if (!month1 || !month2) return null;
    const year = new Date().getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');
    // CEST (UTC+2) Apr-Oct, CET (UTC+1) Nov-Mar
    const tz1 = month1 >= 4 && month1 <= 10 ? '+02:00' : '+01:00';
    const tz2 = month2 >= 4 && month2 <= 10 ? '+02:00' : '+01:00';
    const fromStr = `${year}-${pad(month1)}-${pad(Number(d1))}T00:00:00${tz1}`;
    const untilStr = `${year}-${pad(month2)}-${pad(Number(d2))}T23:59:59${tz2}`;
    const validFrom = new Date(fromStr).toISOString();
    const validUntil = new Date(untilStr).toISOString().replace(/\.\d{3}Z$/, '.999Z');
    return { validFrom, validUntil };
  }

  protected getPromptHints(): string {
    return 'Hoogvliet groups products by category (e.g., "Extra voordelig", "Aardappelen, groente, fruit"). Extract all products from all categories.';
  }
}
