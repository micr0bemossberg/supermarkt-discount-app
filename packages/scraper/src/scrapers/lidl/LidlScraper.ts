/**
 * Lidl Scraper
 * Scrapes discount offers from Lidl website
 *
 * NOTE: Lidl may use PDF catalogs or a different structure.
 * This scraper follows the same pattern as AH/Jumbo but may need
 * significant adjustments based on actual website structure.
 */

import { BaseScraper } from '../base/BaseScraper';
import { lidlSelectors as selectors } from './selectors';
import { parsePrice, calculateDiscountPercentage } from '../../utils/deduplication';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class LidlScraper extends BaseScraper {
  constructor() {
    super('lidl', 'https://www.lidl.nl/aanbiedingen');
  }

  /**
   * Determine category from product title
   */
  private detectCategory(title: string): string | undefined {
    const lowerTitle = title.toLowerCase();

    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (lowerTitle.includes(keyword)) {
        return category;
      }
    }

    return 'overig';
  }

  /**
   * Extract validity dates
   */
  private getValidityDates(): { validFrom: Date; validUntil: Date } {
    const today = new Date();
    const dayOfWeek = today.getDay();

    // Lidl typically runs Monday to Sunday offers
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
      validFrom: monday,
      validUntil: sunday,
    };
  }

  /**
   * Parse a single product element
   */
  private async parseProduct(element: any): Promise<ScrapedProduct | null> {
    try {
      // Extract title
      const titleElement = await element.$(selectors.title);
      const title = titleElement
        ? (await titleElement.textContent())?.trim()
        : null;

      if (!title) {
        return null;
      }

      // Extract discount price
      const discountPriceElement = await element.$(selectors.discountPrice);
      const discountPriceText = discountPriceElement
        ? (await discountPriceElement.textContent())?.trim()
        : null;

      const discountPrice = parsePrice(discountPriceText);
      if (!discountPrice) {
        return null;
      }

      // Extract original price (optional)
      const originalPriceElement = await element.$(selectors.originalPrice);
      const originalPriceText = originalPriceElement
        ? (await originalPriceElement.textContent())?.trim()
        : null;

      const originalPrice = parsePrice(originalPriceText);

      // Extract discount percentage
      let discountPercentage: number | undefined;
      const discountBadgeElement = await element.$(selectors.discountBadge);
      if (discountBadgeElement) {
        const badgeText = (await discountBadgeElement.textContent())?.trim();
        const match = badgeText?.match(/(\d+)%/);
        if (match) {
          discountPercentage = parseInt(match[1], 10);
        }
      }

      if (!discountPercentage && originalPrice && discountPrice) {
        discountPercentage = calculateDiscountPercentage(
          originalPrice,
          discountPrice
        );
      }

      // Extract image URL
      const imageElement = await element.$(selectors.image);
      let imageUrl: string | undefined;
      if (imageElement) {
        imageUrl =
          (await imageElement.getAttribute('src')) ||
          (await imageElement.getAttribute('data-src')) ||
          undefined;

        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = new URL(imageUrl, this.baseUrl).href;
        }
      }

      // Extract product URL
      const linkElement = await element.$(selectors.productLink);
      let productUrl: string | undefined;
      if (linkElement) {
        const href = await linkElement.getAttribute('href');
        if (href) {
          productUrl = href.startsWith('http')
            ? href
            : new URL(href, 'https://www.lidl.nl').href;
        }
      }

      // Extract description
      const descriptionElement = await element.$(selectors.description);
      const description = descriptionElement
        ? (await descriptionElement.textContent())?.trim()
        : undefined;

      // Extract unit info
      const unitInfoElement = await element.$(selectors.unitInfo);
      const unitInfo = unitInfoElement
        ? (await unitInfoElement.textContent())?.trim()
        : undefined;

      // Detect category
      const categorySlug = this.detectCategory(title);

      // Get validity dates
      const { validFrom, validUntil } = this.getValidityDates();

      const scrapedProduct: ScrapedProduct = {
        title,
        description,
        original_price: originalPrice ?? undefined,
        discount_price: discountPrice,
        discount_percentage: discountPercentage,
        image_url: imageUrl,
        product_url: productUrl,
        unit_info: unitInfo,
        valid_from: validFrom,
        valid_until: validUntil,
        category_slug: categorySlug,
      };

      return scrapedProduct;
    } catch (error) {
      this.logger.error('Error parsing product', error);
      return null;
    }
  }

  /**
   * Scrape all products from Lidl
   */
  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    // Initialize browser
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);

      // Navigate to offers page
      await page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      this.logger.success('Page loaded');

      // Handle cookie consent
      await this.handleCookieConsent(page);

      // Wait for product grid
      try {
        await page.waitForSelector(selectors.productGrid, { timeout: 10000 });
      } catch (error) {
        this.logger.warning('Product grid not found, trying product cards directly');
        await page.waitForSelector(selectors.productCard, { timeout: 10000 });
      }

      // Scroll to load all products
      await this.scrollToLoadAll(page);

      // Get all product elements
      this.logger.info('Extracting products...');
      const productElements = await page.$$(selectors.productCard);

      this.logger.info(`Found ${productElements.length} product elements`);

      // Parse each product
      for (const element of productElements) {
        const product = await this.parseProduct(element);

        if (product) {
          products.push(product);
          this.logger.debug(`Scraped: ${product.title} - €${product.discount_price}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      this.logger.success(`Scraped ${products.length} products from Lidl`);
    } catch (error) {
      this.logger.error('Error during scraping', error);
      throw error;
    }

    return products;
  }

  /**
   * Scroll to load all products
   */
  private async scrollToLoadAll(page: any): Promise<void> {
    try {
      this.logger.info('Scrolling to load all products...');

      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20;

      while (scrollAttempts < maxScrollAttempts) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        if (currentHeight === previousHeight) {
          break;
        }

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        previousHeight = currentHeight;
        scrollAttempts++;
      }

      this.logger.success('Finished scrolling');
    } catch (error) {
      this.logger.warning('Error during scrolling', error);
    }
  }
}
