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
    // Dirk multi-product cards: click → modal overlay → screenshot → close.
    // Uses direct DOM clicks via page.evaluate() to bypass Playwright's
    // actionability checks (scrollIntoView, visibility, pointer intercept)
    // which add ~2-3s of retries per card.

    const count = await page.locator('article .middle-item.multi-product').count();
    if (count === 0) return;

    this.logger.info(`Found ${count} multi-product cards — expanding all`);

    // Get all multi-product element handles for direct DOM manipulation
    const elements = await page.$$('article .middle-item.multi-product');

    for (let i = 0; i < elements.length; i++) {
      try {
        // Direct DOM click — no actionability checks, no retry loops
        await elements[i].evaluate(el => {
          el.scrollIntoView({ block: 'center' });
          (el as HTMLElement).click();
        });

        // Brief wait for overlay animation
        await page.waitForSelector('.overlay', { state: 'visible', timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(150);

        // Screenshot
        this.multiProductScreenshots.push(await page.screenshot({ type: 'png' }));

        // Direct DOM close
        await page.evaluate(() => {
          const btn = document.querySelector('button.close[aria-label="Sluiten"]') as HTMLElement;
          btn?.click();
        });

        // Brief wait for close animation
        await page.waitForSelector('.overlay', { state: 'hidden', timeout: 800 }).catch(() => {});
      } catch {
        // Force-close any stuck overlay
        await page.evaluate(() => {
          (document.querySelector('button.close[aria-label="Sluiten"]') as HTMLElement)?.click();
        }).catch(() => {});
        await page.waitForTimeout(100);
      }
    }

    this.logger.info(`Captured ${this.multiProductScreenshots.length}/${count} modal screenshots`);
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
