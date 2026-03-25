import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class JumboScraper extends ScreenshotOCRScraper {
  constructor() { super('jumbo', 'https://www.jumbo.com/aanbiedingen/nu'); }
  getSupermarketName() { return 'Jumbo'; }

  getTargetUrl() {
    return 'https://www.jumbo.com/aanbiedingen/nu';
  }

  protected getWaitUntil(): 'networkidle' | 'domcontentloaded' | 'load' {
    return 'domcontentloaded';
  }

  protected getPromptHints(): string {
    return `Jumbo supermarket discounts organized by aisle category.
Products with "Extra's" badge require a Jumbo loyalty card — mark requires_card=true for these.
Each product card shows: product name, price, deal description (e.g., "2 voor 3.00", "1+1 gratis"), and sometimes original price.`;
  }
}
