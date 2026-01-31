/**
 * Base Scraper Class
 * Abstract class that all supermarket-specific scrapers extend
 */

import { chromium, firefox, Browser, Page, BrowserContext } from 'playwright';
import { SCRAPER_CONFIG } from '../../config/constants';
import { createLogger } from '../../utils/logger';
import { processProductImage } from '../../utils/imageProcessor';
import { insertProduct } from '../../database/products';
import { createScrapeLog } from '../../database/scrapeLogs';
import { isValidProduct } from '../../utils/deduplication';
import type {
  ScrapedProduct,
  ScrapeResult,
  SupermarketSlug,
} from '@supermarkt-deals/shared';
import * as fs from 'fs';
import * as path from 'path';

export abstract class BaseScraper {
  protected supermarketSlug: SupermarketSlug;
  protected baseUrl: string;
  protected logger: ReturnType<typeof createLogger>;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected startTime: number = 0;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    this.supermarketSlug = supermarketSlug;
    this.baseUrl = baseUrl;
    this.logger = createLogger(`Scraper:${supermarketSlug.toUpperCase()}`);
  }

  /**
   * Initialize browser and page
   * Uses Firefox by default as it has better anti-detection properties
   */
  protected async initBrowser(): Promise<Page> {
    this.logger.info('Initializing browser...');

    // Use Firefox for better bot detection evasion
    const useFirefox = process.env.USE_FIREFOX !== 'false';

    if (useFirefox) {
      this.browser = await firefox.launch({
        headless: SCRAPER_CONFIG.HEADLESS,
      });
    } else {
      this.browser = await chromium.launch({
        headless: SCRAPER_CONFIG.HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }

    // Create context with random user agent
    const userAgent = this.getRandomUserAgent();
    this.context = await this.browser.newContext({
      userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL',
      timezoneId: 'Europe/Amsterdam',
    });

    // Add stealth scripts (mainly for Chromium, but doesn't hurt Firefox)
    await this.context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Remove automation indicators
      delete (navigator as any).__proto__.webdriver;

      // Override Chrome detection (only affects Chromium)
      if ((window as any).chrome === undefined) {
        (window as any).chrome = { runtime: {} };
      }

      // Override permissions
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({
                state: Notification.permission,
              } as PermissionStatus)
            : originalQuery.call(window.navigator.permissions, parameters);
      }

      // Override plugins to look more like a real browser
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['nl-NL', 'nl', 'en-US', 'en'],
      });
    });

    this.page = await this.context.newPage();

    this.logger.success(`Browser initialized (${useFirefox ? 'Firefox' : 'Chromium'})`);
    return this.page;
  }

  /**
   * Get random user agent for rotation
   */
  protected getRandomUserAgent(): string {
    const userAgents = SCRAPER_CONFIG.USER_AGENTS;
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Add random delay between actions
   */
  protected async randomDelay(): Promise<void> {
    const delay =
      Math.random() *
        (SCRAPER_CONFIG.MAX_DELAY_MS - SCRAPER_CONFIG.MIN_DELAY_MS) +
      SCRAPER_CONFIG.MIN_DELAY_MS;
    this.logger.debug(`Waiting ${Math.round(delay)}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Handle cookie consent popup (common across most Dutch sites)
   */
  protected async handleCookieConsent(page: Page): Promise<void> {
    try {
      this.logger.info('Checking for cookie consent...');

      // Wait a moment for dialog to appear
      await page.waitForTimeout(2000);

      // Common Dutch cookie consent button selectors (ordered by specificity)
      const cookieSelectors = [
        // AH specific - their privacy dialog uses these
        'button#accept-cookies',
        'button[data-testid="accept-cookies"]',
        '[class*="cookie"] button:has-text("Accepteren")',
        '[class*="privacy"] button:has-text("Accepteren")',
        '[class*="consent"] button:has-text("Accepteren")',
        '[role="dialog"] button:has-text("Accepteren")',
        // Generic Dutch selectors
        'button:has-text("Accepteren")',
        'button:has-text("Alle cookies accepteren")',
        'button:has-text("Akkoord")',
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        '[data-testid="cookie-accept"]',
        '[id*="cookie"][id*="accept"]',
        '.cookie-accept',
        '#onetrust-accept-btn-handler',
        // OneTrust (used by many Dutch sites)
        '#accept-recommended-btn-handler',
      ];

      for (const selector of cookieSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 500 })) {
            await button.click();
            this.logger.success(`Cookie consent accepted via: ${selector}`);
            await page.waitForTimeout(1500);
            return;
          }
        } catch (error) {
          // Try next selector
        }
      }

      // Try clicking by exact text match as last resort
      try {
        const acceptButton = page.getByRole('button', { name: 'Accepteren' });
        if (await acceptButton.isVisible({ timeout: 500 })) {
          await acceptButton.click();
          this.logger.success('Cookie consent accepted via role button');
          await page.waitForTimeout(1500);
          return;
        }
      } catch (error) {
        // No button found
      }

      this.logger.debug('No cookie consent found');
    } catch (error) {
      this.logger.warning('Error handling cookie consent', error);
    }
  }

  /**
   * Take screenshot on error
   */
  protected async captureScreenshot(name: string): Promise<string | null> {
    if (!SCRAPER_CONFIG.SCREENSHOT_ON_ERROR || !this.page) {
      return null;
    }

    try {
      const screenshotsDir = SCRAPER_CONFIG.SCREENSHOTS_DIR;

      // Create screenshots directory if it doesn't exist
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${this.supermarketSlug}_${name}_${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      this.logger.info(`Screenshot saved: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logger.error('Failed to capture screenshot', error);
      return null;
    }
  }

  /**
   * Process scraped products: validate, process images, insert into database
   */
  protected async processProducts(
    scrapedProducts: ScrapedProduct[]
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    this.logger.info(`Processing ${scrapedProducts.length} products...`);

    for (const product of scrapedProducts) {
      try {
        // Validate product
        if (!isValidProduct(product)) {
          this.logger.warning(`Invalid product, skipping: ${product.title}`);
          skipped++;
          continue;
        }

        // Process image if available
        let imageUrl: string | undefined;
        let imagePath: string | undefined;

        if (product.image_url) {
          const processedImage = await processProductImage(
            product.image_url,
            this.supermarketSlug
          );

          if (processedImage) {
            imageUrl = processedImage.publicUrl;
            imagePath = processedImage.storagePath;
          }
        }

        // Insert product into database
        const result = await insertProduct(
          product,
          this.supermarketSlug,
          imageUrl,
          imagePath
        );

        if (result) {
          inserted++;
        } else {
          skipped++;
        }

        // Small delay between products to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`Error processing product: ${product.title}`, error);
        skipped++;
      }
    }

    this.logger.success(
      `Processed: ${inserted} inserted, ${skipped} skipped`
    );

    return { inserted, skipped };
  }

  /**
   * Cleanup: close browser and context
   */
  protected async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.logger.info('Browser closed');
    } catch (error) {
      this.logger.error('Error during cleanup', error);
    }
  }

  /**
   * Retry wrapper for scraping with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = SCRAPER_CONFIG.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warning(`Attempt ${attempt}/${retries} failed`, error);

        if (attempt === retries) {
          throw error;
        }

        // Exponential backoff
        const delay = SCRAPER_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.info(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * Main scrape method - to be implemented by subclasses
   */
  protected abstract scrapeProducts(): Promise<ScrapedProduct[]>;

  /**
   * Run the scraper
   */
  public async run(): Promise<ScrapeResult> {
    this.startTime = Date.now();
    this.logger.info(`Starting scraper for ${this.supermarketSlug.toUpperCase()}`);

    let result: ScrapeResult = {
      success: false,
      supermarket_slug: this.supermarketSlug,
      products_scraped: 0,
      products_inserted: 0,
      products_updated: 0,
      duration_seconds: 0,
    };

    try {
      // Run scraping with retry logic
      const scrapedProducts = await this.retryOperation(() =>
        this.scrapeProducts()
      );

      result.products_scraped = scrapedProducts.length;

      // Process and insert products
      const { inserted, skipped } = await this.processProducts(scrapedProducts);

      result.products_inserted = inserted;
      result.success = true;

      this.logger.success(
        `✓ Scraping completed: ${inserted} products inserted, ${skipped} skipped`
      );
    } catch (error: any) {
      this.logger.error('Scraping failed', error);

      result.error_message = error.message || 'Unknown error';

      // Capture screenshot on error
      const screenshotPath = await this.captureScreenshot('error');
      if (screenshotPath) {
        result.error_screenshot_path = screenshotPath;
      }
    } finally {
      // Cleanup
      await this.cleanup();

      // Calculate duration
      const endTime = Date.now();
      result.duration_seconds = Math.round((endTime - this.startTime) / 1000);

      // Log to database
      await createScrapeLog(result);

      this.logger.info(`Duration: ${result.duration_seconds}s`);
    }

    return result;
  }
}
