import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';
import type { ImageChunk } from '../../gemini/types';

export class DirkScraper extends ScreenshotOCRScraper {
  constructor() { super('dirk', 'https://www.dirk.nl/aanbiedingen'); }
  getSupermarketName() { return 'Dirk van den Broek'; }

  getTargetUrl() {
    return 'https://www.dirk.nl/aanbiedingen';
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Dirk has multi-product cards (e.g., "Gesneden fruit" → Meloenmix + Fruitsalade).
    // Identified by `.middle-item.multi-product`. Clicking opens a modal overlay.
    // Close button is `button.close[aria-label="Sluiten"]` inside `.overlay`.

    const multiProducts = page.locator('article .middle-item.multi-product');
    const count = await multiProducts.count();

    if (count === 0) return;

    this.logger.info(`Found ${count} multi-product cards to expand`);

    for (let i = 0; i < count; i++) {
      try {
        // Scroll into view and click
        await multiProducts.nth(i).scrollIntoViewIfNeeded({ timeout: 2000 });
        await multiProducts.nth(i).click({ force: true, timeout: 2000 });

        // Wait for overlay to appear
        await page.locator('.overlay').waitFor({ state: 'visible', timeout: 2000 });
        await page.waitForTimeout(300);

        // Screenshot the modal
        const screenshot = await page.screenshot({ type: 'png' });
        this.multiProductScreenshots.push(screenshot);

        // Close via the exact button: button.close[aria-label="Sluiten"]
        await page.locator('button.close[aria-label="Sluiten"]').click({ force: true, timeout: 2000 });

        // Wait for overlay to disappear
        await page.locator('.overlay').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
      } catch {
        // If anything fails, force-close any open overlay and continue
        await page.locator('button.close[aria-label="Sluiten"]').click({ force: true }).catch(() => {});
        await page.locator('.overlay').waitFor({ state: 'hidden', timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    }

    this.logger.info(`Captured ${this.multiProductScreenshots.length} multi-product modal screenshots`);
  }

  private multiProductScreenshots: Buffer[] = [];

  async scrapeProducts() {
    this.multiProductScreenshots = [];
    return super.scrapeProducts();
  }

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
