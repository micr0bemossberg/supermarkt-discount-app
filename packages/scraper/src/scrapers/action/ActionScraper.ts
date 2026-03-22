import { ScreenshotOCRScraper, type ScrollConfig } from '../base/ScreenshotOCRScraper';

export class ActionScraper extends ScreenshotOCRScraper {
  constructor() { super('action', 'https://www.action.com/nl-nl/weekactie/'); }
  getSupermarketName() { return 'Action'; }

  getTargetUrl() {
    return 'https://www.action.com/nl-nl/weekactie/';
  }

  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 768,     // Narrower viewport — products render larger, easier for OCR
      viewportHeight: 800,
      overlapPercent: 0.2,
      maxChunks: 25,
      scrollDelayMs: [200, 500],
    };
  }

  protected getPromptHints(): string {
    return 'Action sells non-food items (household, electronics, toys, personal care). This page has MANY products in a grid layout. Extract EVERY product visible — there should be 100+ products. Each product card shows: product name, price, and sometimes an original price or discount badge.';
  }
}
