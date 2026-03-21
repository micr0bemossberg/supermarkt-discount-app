import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class AldiScraper extends ScreenshotOCRScraper {
  constructor() { super('aldi', 'https://www.aldi.nl/aanbiedingen'); }
  getSupermarketName() { return 'Aldi'; }

  getTargetUrl() {
    return 'https://www.aldi.nl/aanbiedingen';
  }

  protected getWaitUntil(): 'networkidle' | 'domcontentloaded' | 'load' {
    return 'domcontentloaded'; // Aldi has continuous background requests, networkidle times out
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Wait for product content to load
    await page.waitForTimeout(3000);

    // Click "Toon meer" button if present to load all products
    const showMore = page.locator('button:has-text("Toon meer"), button:has-text("Meer laden")');
    while (await showMore.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(1000);
    }
  }

  protected getPromptHints(): string {
    return 'Aldi runs Thursday-to-Wednesday deal cycles (not Monday-Sunday). Extract dates carefully.';
  }
}
