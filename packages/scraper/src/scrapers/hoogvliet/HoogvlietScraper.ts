import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class HoogvlietScraper extends ScreenshotOCRScraper {
  constructor() { super('hoogvliet', 'https://www.hoogvliet.com/aanbiedingen'); }
  getSupermarketName() { return 'Hoogvliet'; }

  getTargetUrl() {
    return 'https://www.hoogvliet.com/aanbiedingen';
  }
}
