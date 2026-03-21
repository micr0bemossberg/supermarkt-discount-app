import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class DekamarktScraper extends PublitasOCRScraper {
  constructor() {
    super('dekamarkt', 'https://folder.dekamarkt.nl');
  }

  getSupermarketName() { return 'DekaMarkt'; }

  async getPublitasUrl(): Promise<string> {
    // folder.dekamarkt.nl redirects to the current week's publication URL
    const response = await fetch('https://folder.dekamarkt.nl', { redirect: 'follow' });
    const finalUrl = response.url.replace(/\/$/, '');
    this.logger.info(`DekaMarkt folder → ${finalUrl}`);
    return finalUrl;
  }

  protected getPromptHints(): string {
    return 'DekaMarkt digital flyer. Look for "per stuk" and "per kilo" unit pricing.';
  }
}
