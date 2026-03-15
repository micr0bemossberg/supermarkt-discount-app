import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class VomarScraper extends PublitasOCRScraper {
  constructor() {
    super('vomar', 'https://www.vomar.nl/aanbiedingen');
  }

  getSupermarketName() { return 'Vomar'; }

  protected needsBrowserForUrl(): boolean {
    return true; // Vomar's Publitas URL changes weekly
  }

  async getPublitasUrl(): Promise<string> {
    // Navigate to Vomar's aanbiedingen page to find the current Publitas embed
    const page = await this.initBrowser();
    await page.goto('https://www.vomar.nl/aanbiedingen', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Extract the Publitas embed URL from the page
    const publitasUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="publitas"]');
      return iframe?.getAttribute('src') || null;
    });

    await page.close();

    if (!publitasUrl) {
      throw new Error('Could not find Publitas embed URL on Vomar aanbiedingen page');
    }

    return publitasUrl;
  }

  protected getPromptHints(): string {
    return 'Vomar uses a digital flyer (folder). Products may show "Vomar app" which means a digital coupon is required.';
  }
}
