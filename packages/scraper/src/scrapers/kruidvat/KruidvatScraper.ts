import { ScreenshotOCRScraper } from '../base/ScreenshotOCRScraper';

export class KruidvatScraper extends ScreenshotOCRScraper {
  constructor() { super('kruidvat', 'https://www.kruidvat.nl/acties'); }
  getSupermarketName() { return 'Kruidvat'; }

  protected getBrowserType(): 'chromium' | 'firefox' {
    return 'firefox'; // Chromium blocked by TLS fingerprinting
  }

  getTargetUrl() {
    return 'https://www.kruidvat.nl/acties';
  }

  protected getPromptHints(): string {
    return 'Kruidvat sells personal care, beauty, and household items. Look for "1+1 gratis" and "2e halve prijs" deals.';
  }
}
