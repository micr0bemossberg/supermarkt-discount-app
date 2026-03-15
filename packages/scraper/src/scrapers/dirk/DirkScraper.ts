import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class DirkScraper extends ScreenshotOCRScraper {
  constructor() { super('dirk', 'https://www.dirk.nl/aanbiedingen'); }
  getSupermarketName() { return 'Dirk van den Broek'; }

  getTargetUrl() {
    return 'https://www.dirk.nl/aanbiedingen';
  }
}
