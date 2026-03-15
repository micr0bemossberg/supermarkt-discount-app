import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class ActionScraper extends ScreenshotOCRScraper {
  constructor() { super('action', 'https://www.action.com/nl-nl/weekactie/'); }
  getSupermarketName() { return 'Action'; }

  getTargetUrl() {
    return 'https://www.action.com/nl-nl/weekactie/';
  }

  protected getPromptHints(): string {
    return 'Action sells non-food items (household, electronics, toys). Categorize accordingly.';
  }
}
