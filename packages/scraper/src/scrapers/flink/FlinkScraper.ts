import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class FlinkScraper extends ScreenshotOCRScraper {
  constructor() { super('flink', 'https://www.goflink.com/shop/nl-NL/'); }
  getSupermarketName() { return 'Flink'; }

  getTargetUrl() {
    return 'https://www.goflink.com/shop/nl-NL/';
  }
}
