import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class HanosScraper extends PublitasOCRScraper {
  constructor() {
    super('hanos', 'https://folders.hanos.nl');
  }

  getSupermarketName() { return 'Hanos'; }

  protected needsBrowserForUrl(): boolean {
    return true; // Need to resolve current courant URL
  }

  async getPublitasUrl(): Promise<string> {
    const page = await this.initBrowser();

    // folders.hanos.nl shows available publications — find the current courant
    await page.goto('https://folders.hanos.nl', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // The page URL may include /page/X — strip it to get the publication root
    let finalUrl = page.url().replace(/\/page\/.*$/, '').replace(/\/$/, '');

    // If we landed on an old magazine, look for a courant link on the page
    if (!finalUrl.includes('courant')) {
      const courantUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="courant"]'));
        for (let i = 0; i < links.length; i++) {
          const href = links[i].getAttribute('href');
          if (href) return href;
        }
        return null;
      });
      if (courantUrl) {
        finalUrl = courantUrl.startsWith('http') ? courantUrl : `https://folders.hanos.nl${courantUrl}`;
        finalUrl = finalUrl.replace(/\/page\/.*$/, '').replace(/\/$/, '');
      }
    }

    await page.close();
    this.logger.info(`Hanos folder → ${finalUrl}`);
    return finalUrl;
  }

  protected getSkipPages(): number[] {
    return []; // Don't skip cover
  }

  protected getPromptHints(): string {
    return [
      'Hanos is a Dutch wholesale supermarket (horeca groothandel).',
      'Prices shown are ex-BTW (excluding VAT) unless stated otherwise.',
      'Products are sold in bulk/catering quantities (large packs, trays, cases).',
      '"Courant" is their weekly deals folder.',
      'Extract ALL products visible on each page.',
    ].join(' ');
  }
}
