import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class ButlonScraper extends ScreenshotOCRScraper {
  constructor() { super('butlon', 'https://www.butlon.nl'); }
  getSupermarketName() { return 'Butlon'; }

  getTargetUrl() {
    return 'https://www.butlon.nl';
  }
}
