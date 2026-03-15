import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class JoybuyScraper extends ScreenshotOCRScraper {
  constructor() { super('joybuy', 'https://www.joybuy.nl'); }
  getSupermarketName() { return 'JoyBuy'; }

  protected getBrowserType(): 'chromium' | 'firefox' {
    return 'firefox';
  }

  getTargetUrl() {
    return 'https://www.joybuy.nl';
  }
}
