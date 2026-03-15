import type { Page } from 'playwright';
import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class JumboScraper extends ScreenshotOCRScraper {
  constructor() { super('jumbo', 'https://www.jumbo.com/aanbiedingen'); }
  getSupermarketName() { return 'Jumbo'; }

  getTargetUrl() {
    return 'https://www.jumbo.com/aanbiedingen';
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Jumbo may lazy-load deals -- scroll to trigger
    const loadMore = page.locator('button:has-text("Meer laden"), button:has-text("Laad meer")');
    while (await loadMore.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loadMore.click();
      await page.waitForTimeout(1500);
    }
  }

  protected getPromptHints(): string {
    return 'Jumbo shows "Extra\'s" deals that require a loyalty card. Mark requires_card=true for these.';
  }
}
