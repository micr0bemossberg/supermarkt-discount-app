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
    const embedUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="publitas"]');
      return iframe?.getAttribute('src') || null;
    });

    await page.close();

    if (!embedUrl) {
      throw new Error('Could not find Publitas embed URL on Vomar aanbiedingen page');
    }

    // The embed URL (e.g., /folder-deze-week) redirects to the actual publication URL.
    // Follow the redirect to get the real URL that has spreads.json.
    const cleanUrl = embedUrl.startsWith('http') ? embedUrl.split('?')[0] : `https://view.publitas.com${embedUrl.split('?')[0]}`;
    const response = await fetch(cleanUrl, { redirect: 'follow' });
    const finalUrl = response.url.replace(/\/$/, '');

    this.logger.info(`Publitas embed → ${finalUrl}`);
    return finalUrl;
  }

  /** Vomar cover page has products (e.g., weekly hero deals), don't skip it */
  protected getSkipPages(): number[] {
    return [];
  }

  protected getPromptHints(): string {
    return [
      'Vomar uses a digital flyer (folder).',
      'Products may show "Vomar app" which means a digital coupon/voucher is required (set requires_card=true).',
      'The cover page (first page) contains real product deals — extract them.',
      '"Weekendacties" are weekend-only deals (deal_type=weekend_actie).',
      'Look carefully for ALL products on each page, including smaller items and sidebar deals.',
    ].join(' ');
  }
}
