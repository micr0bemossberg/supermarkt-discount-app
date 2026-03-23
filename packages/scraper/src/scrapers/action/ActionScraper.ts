import { ScreenshotOCRScraper, type ScrollConfig } from '../base/ScreenshotOCRScraper';

export class ActionScraper extends ScreenshotOCRScraper {
  constructor() { super('action', 'https://www.action.com/nl-nl/weekactie/'); }
  getSupermarketName() { return 'Action'; }

  getTargetUrl() {
    return 'https://www.action.com/nl-nl/weekactie/';
  }

  protected getScrollConfig(): ScrollConfig {
    return {
      viewportWidth: 1280,
      viewportHeight: 600,    // Shorter chunks — fewer products per chunk avoids Gemini timeout
      overlapPercent: 0.2,
      maxChunks: 25,
      scrollDelayMs: [200, 500],
    };
  }

  protected getThinkingLevel(): 'minimal' | 'low' | 'medium' | 'high' {
    return 'medium'; // Dense product grid — 'high' causes timeouts, 'medium' is faster + fewer misses
  }

  protected getPromptHints(): string {
    return 'Action sells non-food items (household, electronics, toys, personal care). Extract EVERY product card visible. Each shows: product name, price, and sometimes an original price or discount percentage.';
  }
}
