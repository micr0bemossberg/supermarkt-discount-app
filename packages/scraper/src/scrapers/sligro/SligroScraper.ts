import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class SligroScraper extends PublitasOCRScraper {
  constructor() {
    super('sligro', 'https://folder.sligro.nl');
  }

  getSupermarketName() { return 'Sligro'; }

  protected needsBrowserForUrl(): boolean {
    return true; // Need to find the current food folder URL
  }

  async getPublitasUrl(): Promise<string> {
    // Sligro food folders follow pattern: foodvers-{period}-{year}
    // Try current period first, then fall back to discovery
    const now = new Date();
    const year = now.getFullYear();
    // Sligro uses ~13 periods per year (every 4 weeks)
    const period = String(Math.ceil((now.getMonth() * 30 + now.getDate()) / 28)).padStart(2, '0');

    // Try common patterns
    const candidates = [
      `https://folder.sligro.nl/foodvers-${period}-${year}`,
      `https://folder.sligro.nl/foodvers-${String(Number(period) - 1).padStart(2, '0')}-${year}`,
      `https://folder.sligro.nl/foodvers-${String(Number(period) + 1).padStart(2, '0')}-${year}`,
    ];

    for (const url of candidates) {
      try {
        const resp = await fetch(`${url}/spreads.json`, { method: 'HEAD' });
        if (resp.ok) {
          this.logger.info(`Sligro food folder → ${url}`);
          return url;
        }
      } catch {}
    }

    // Fallback: navigate and use whatever folder.sligro.nl shows
    this.logger.warning('Could not find food folder by pattern, using default');
    const page = await this.initBrowser();
    await page.goto('https://folder.sligro.nl', { waitUntil: 'networkidle', timeout: 30000 });
    const finalUrl = page.url().replace(/\/page\/.*$/, '').replace(/\/$/, '');
    await page.close();
    this.logger.info(`Sligro folder (fallback) → ${finalUrl}`);
    return finalUrl;
  }

  protected getSkipPages(): number[] {
    return []; // Don't skip cover — may have deals
  }

  protected getPromptHints(): string {
    return [
      'Sligro is a Dutch wholesale supermarket (groothandel).',
      'Prices shown are ex-BTW (excluding VAT) unless stated otherwise.',
      'Products are sold in bulk/catering quantities.',
      'Extract ALL products visible on each page.',
    ].join(' ');
  }
}
