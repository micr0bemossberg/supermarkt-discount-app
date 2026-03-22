import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';
import type { ScrollConfig } from '../base/ScreenshotOCRScraper';

export class HoogvlietScraper extends ScreenshotOCRScraper {
  constructor() { super('hoogvliet', 'https://www.hoogvliet.com/aanbiedingen'); }
  getSupermarketName() { return 'Hoogvliet'; }

  getTargetUrl() {
    return 'https://www.hoogvliet.com/aanbiedingen';
  }

  /**
   * Smaller viewport height (600px instead of 800px) to reduce the number of
   * products per screenshot chunk. Hoogvliet has dense product grids that cause
   * Gemini to time out at 120s with thinkingLevel 'high' on larger chunks.
   */
  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 1280,
      viewportHeight: 600,
      overlapPercent: 0.2,
      maxChunks: 35,         // More chunks needed since each is shorter
      scrollDelayMs: [200, 500],
    };
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Hoogvliet uses AJAX lazy loading (PromotionLoadScroll).
    // Products load in category groups as user scrolls.
    // Gradual scroll in 400px steps with 800ms delay to trigger all loads.
    let lastProductCount = 0;
    let stableRounds = 0;

    for (let i = 0; i < 80; i++) { // Max 80 scrolls (~32000px)
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

    // Scroll back to top for screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  protected getPromptHints(): string {
    return 'Hoogvliet groups products by category (e.g., "Extra voordelig", "Aardappelen, groente, fruit"). Extract all products from all categories.';
  }
}
