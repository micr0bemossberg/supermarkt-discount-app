import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class MegafoodstunterScraper extends ScreenshotOCRScraper {
  constructor() { super('megafoodstunter', 'https://www.megafoodstunter.nl'); }
  getSupermarketName() { return 'MegaFoodstunter'; }

  getTargetUrl() {
    return 'https://www.megafoodstunter.nl';
  }
}
