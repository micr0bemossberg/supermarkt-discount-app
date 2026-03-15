import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class DirkScraper extends ScreenshotOCRScraper {
  constructor() { super('dirk', 'https://www.dirk.nl/aanbiedingen'); }
  getSupermarketName() { return 'Dirk van den Broek'; }

  getTargetUrl() {
    return 'https://www.dirk.nl/aanbiedingen';
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Dirk has expandable product cards with a dropdown arrow that reveals
    // variants, unit info, and original prices. Click all expand arrows
    // to show full product details before taking screenshots.
    const expandButtons = page.locator('[class*="expand"], [class*="dropdown"], [class*="toggle"], button[aria-expanded="false"]');
    const count = await expandButtons.count();

    if (count > 0) {
      this.logger.info(`Found ${count} expandable product cards, clicking to reveal details...`);
      for (let i = 0; i < count; i++) {
        try {
          await expandButtons.nth(i).click({ timeout: 2000 });
          await page.waitForTimeout(300); // Brief pause for animation
        } catch {
          // Some buttons may not be clickable — continue
        }
      }
      // Wait for all expansions to settle
      await page.waitForTimeout(1000);
    }
  }

  protected getPromptHints(): string {
    return `Dirk uses expandable product cards. Some products have multiple variants shown below the main card.
Look carefully for "van X.XX" text near prices — this shows the original price before discount.
Also look for weight/unit info below product names (e.g., "500 g", "Per schaal.", "1,5 kg", "4 kg", "1 kg").`;
  }
}
