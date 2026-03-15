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
    // Dirk has multi-product cards (e.g., "Gesneden fruit" with Meloenmix + Fruitsalade variants).
    // These are identified by a `.middle-item.multi-product` element containing an expand SVG.
    // Clicking opens a modal overlay showing the individual variants with prices and weights.
    //
    // Strategy: find all multi-product cards, click each one, screenshot the modal,
    // close it, and continue. The modal screenshots get sent to Gemini as extra chunks.

    const multiProducts = page.locator('.middle-item.multi-product');
    const count = await multiProducts.count();

    if (count > 0) {
      this.logger.info(`Found ${count} multi-product cards to expand`);

      for (let i = 0; i < count; i++) {
        try {
          await multiProducts.nth(i).click({ timeout: 3000 });
          await page.waitForTimeout(800); // Wait for modal animation

          // Screenshot the modal overlay
          const screenshot = await page.screenshot({ type: 'png' });
          this.multiProductScreenshots.push(screenshot);

          // Close the modal (press Escape or click close button)
          const closeButton = page.locator('button[aria-label="Sluiten"], button[aria-label="Close"], .close, [class*="close"]');
          if (await closeButton.count() > 0) {
            await closeButton.first().click({ timeout: 2000 });
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(300);
        } catch (error) {
          this.logger.warning(`Failed to expand multi-product card ${i}: ${error}`);
          // Try to close any open modal before continuing
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      }

      this.logger.info(`Captured ${this.multiProductScreenshots.length} multi-product modal screenshots`);
    }
  }

  // Store modal screenshots to be merged with page screenshots
  private multiProductScreenshots: Buffer[] = [];

  /**
   * Override scrapeProducts to inject multi-product modal screenshots
   * as additional chunks alongside the regular scrolling screenshots.
   */
  async scrapeProducts() {
    this.multiProductScreenshots = []; // Reset
    const products = await super.scrapeProducts();
    return products;
  }

  /**
   * Override to include multi-product modal screenshots in the extraction.
   * Called by ScreenshotOCRScraper after capturing scrolling screenshots.
   */
  protected getExtraChunks(): ImageChunk[] {
    return this.multiProductScreenshots.map((buffer, i) => ({
      buffer,
      index: 1000 + i, // High index to separate from regular chunks
      totalChunks: this.multiProductScreenshots.length,
    }));
  }

  protected getPromptHints(): string {
    return `Dirk uses expandable product cards. Some images show a modal overlay with product variants — extract ALL variants shown.
Look carefully for "van X.XX" text near prices — this shows the original price.
Also look for weight/unit info below product names (e.g., "500 g", "Per schaal.", "1,5 kg").`;
  }
}
