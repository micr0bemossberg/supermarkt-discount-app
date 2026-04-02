import { PublitasOCRScraper } from '../base/PublitasOCRScraper';

export class MakroScraper extends PublitasOCRScraper {
  constructor() {
    super('makro', 'https://www.makro.nl/folders');
  }

  getSupermarketName() { return 'Makro'; }

  // Makro blocks Chromium (403) — Firefox bypasses TLS fingerprinting
  protected getBrowserType(): 'chromium' | 'firefox' {
    return 'firefox';
  }

  protected needsBrowserForUrl(): boolean {
    return true;
  }

  async getPublitasUrl(): Promise<string> {
    const page = await this.initBrowser();

    // Step 1: Login via IDAM SSO portal (redirects from makro.nl/login)
    const username = process.env.MAKRO_USERNAME;
    const password = process.env.MAKRO_PASSWORD;

    if (username && password) {
      this.logger.info('Logging in to Makro...');
      await page.goto('https://www.makro.nl/login', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Handle cookie consent
      try {
        const cookieBtn = page.locator('button:has-text("Accepteren"), button:has-text("accepteer"), #onetrust-accept-btn-handler');
        if (await cookieBtn.count() > 0) {
          await cookieBtn.first().click({ timeout: 3000 });
          await page.waitForTimeout(1000);
        }
      } catch {}

      // IDAM SSO form has input#user_id and input#password
      try {
        await page.fill('#user_id', username, { timeout: 10000 });
        await page.fill('#password', password, { timeout: 5000 });
        await page.click('button[type="submit"]', { timeout: 5000 });
        await page.waitForTimeout(8000); // SSO redirect chain takes time
        this.logger.success(`Logged in — now at: ${page.url()}`);
      } catch (e) {
        this.logger.warning(`Login failed: ${e instanceof Error ? e.message.substring(0, 80) : e}`);
      }
    }

    // Step 2: Navigate to folders page (use domcontentloaded — networkidle times out)
    await page.goto('https://www.makro.nl/folders', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000); // Wait for JS rendering

    const pageTitle = await page.title();
    this.logger.info(`Makro folders page: ${pageTitle} (${page.url()})`);

    // Step 3: Find Publitas embed or folder link
    const embedUrl = await page.evaluate(() => {
      // Check iframe
      const iframe = document.querySelector('iframe[src*="publitas"]');
      if (iframe) return iframe.getAttribute('src');
      // Check links
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (let i = 0; i < allLinks.length; i++) {
        const href = allLinks[i].getAttribute('href') || '';
        if (href.includes('publitas.com') || href.includes('folder.makro')) return href;
      }
      return null;
    });

    // Debug: log all links on page
    const allLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h && h.length > 10).slice(0, 15)
    );
    this.logger.info(`Page links: ${allLinks.join(', ')}`);

    await page.close();

    if (embedUrl) {
      const cleanUrl = embedUrl.startsWith('http') ? embedUrl.split('?')[0] : `https://view.publitas.com${embedUrl.split('?')[0]}`;
      const response = await fetch(cleanUrl, { redirect: 'follow' });
      const finalUrl = response.url.replace(/\/$/, '');
      this.logger.info(`Publitas embed → ${finalUrl}`);
      return finalUrl;
    }

    throw new Error('Could not find Makro folder URL — check login and page structure');
  }

  protected getSkipPages(): number[] {
    return []; // Don't skip cover
  }

  protected getPromptHints(): string {
    return [
      'Makro is a Dutch wholesale supermarket (groothandel).',
      'Prices may be ex-BTW (excluding VAT) — look for "excl. btw" or "incl. btw" indicators.',
      'Products are sold in bulk quantities (cases, trays, pallets).',
      'Extract ALL products visible on each page.',
    ].join(' ');
  }
}
