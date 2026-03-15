import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class DekamarktScraper extends PublitasOCRScraper {
  constructor() {
    super('dekamarkt', 'https://folder.dekamarkt.nl');
  }

  getSupermarketName() { return 'DekaMarkt'; }

  getPublitasUrl(): string {
    return 'https://folder.dekamarkt.nl';
  }

  protected getPromptHints(): string {
    return 'DekaMarkt digital flyer. Look for "per stuk" and "per kilo" unit pricing.';
  }
}
