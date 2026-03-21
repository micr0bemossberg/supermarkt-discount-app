import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class MegafoodstunterScraper extends ScreenshotOCRScraper {
  constructor() { super('megafoodstunter', 'https://www.megafoodstunter.nl/acties'); }
  getSupermarketName() { return 'MegaFoodstunter'; }

  getTargetUrl() {
    return 'https://www.megafoodstunter.nl/acties';
  }

  protected getPromptHints(): string {
    return 'MegaFoodStunter is a wholesale/bulk food outlet. Products are sold in bulk (per doos/box). Look for THT dates, "1+1 GRATIS" deals, and prices per unit or per box.';
  }
}
