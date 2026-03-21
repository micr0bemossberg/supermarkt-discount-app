import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class KruidvatScraper extends PublitasOCRScraper {
  constructor() { super('kruidvat', 'https://folder.kruidvat.nl'); }
  getSupermarketName() { return 'Kruidvat'; }

  async getPublitasUrl(): Promise<string> {
    // folder.kruidvat.nl redirects to the current week's folder
    const response = await fetch('https://folder.kruidvat.nl', { redirect: 'follow' });
    const finalUrl = response.url.replace(/\/$/, '');
    this.logger.info(`Kruidvat folder → ${finalUrl}`);
    return finalUrl;
  }

  protected getPromptHints(): string {
    return 'Kruidvat sells personal care, beauty, and household items. Look for "1+1 gratis", "2e halve prijs", and "3 voor" deals.';
  }
}
