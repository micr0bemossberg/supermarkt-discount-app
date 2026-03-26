import type { Page } from 'playwright';
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
      maxChunks: 25,
      scrollDelayMs: [200, 500],
    };
  }

  protected async beforeScreenshots(page: Page): Promise<void> {
    // Wait for page content to render
    await page.waitForTimeout(3000);

    // Scroll through page to trigger any lazy rendering
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const step = 600;
    for (let pos = 0; pos < totalHeight; pos += step) {
      await page.evaluate((y) => window.scrollTo(0, y), pos);
      await page.waitForTimeout(300);
    }

    // Click all carousel "next" arrows to reveal hidden products
    // Each carousel shows ~4-5 products at a time but may contain 10-20
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

    this.logger.info(`Jumbo: clicked ${totalClicks} carousel arrows`);

    // Count products after expansion
    const linkCount = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="/aanbiedingen/"]');
      return new Set(Array.from(links).map(a => a.getAttribute('href')).filter(h => h && h.includes('/')  && h.split('/').length > 3)).size;
    });

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    this.logger.info(`Jumbo: ${linkCount} unique product links found after carousel expansion`);
  }

  protected getThinkingLevel(): 'minimal' | 'low' | 'medium' | 'high' {
    return 'medium';
  }

  protected getPromptHints(): string {
    return `Jumbo supermarket discounts organized by aisle category.
Products with "Extra's" badge require a Jumbo loyalty card — mark requires_card=true for these.
Each product card shows: product name, price, deal description (e.g., "2 voor 3.00", "1+1 gratis"), and sometimes original price.`;
  }
}
