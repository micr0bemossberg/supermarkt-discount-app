/**
 * Albert Heijn Scraper
 * Scrapes discount offers (bonus products) from Albert Heijn website
 */

import { BaseScraper } from '../base/BaseScraper';
import { ahSelectors as selectors } from './selectors';
import { parsePrice, calculateDiscountPercentage } from '../../utils/deduplication';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class AHScraper extends BaseScraper {
  constructor() {
    super('ah', 'https://www.ah.nl/bonus');
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

    return 'overig'; // Default category
  }

  /**
   * Extract validity dates
   * Albert Heijn typically runs weekly bonuses (Monday to Sunday)
   */
  private getValidityDates(): { validFrom: Date; validUntil: Date } {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...

    // Calculate this week's Monday
    const monday = new Date(today);
    const daysFromMonday = (dayOfWeek + 6) % 7;
    monday.setDate(today.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);

    // Calculate this week's Sunday
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
        this.logger.debug('Product missing title, skipping');
        return null;
      }

      // Extract discount price (required)
      const discountPriceElement = await element.$(selectors.discountPrice);
      const discountPriceText = discountPriceElement
        ? (await discountPriceElement.textContent())?.trim()
        : null;

      const discountPrice = parsePrice(discountPriceText);
      if (!discountPrice) {
        this.logger.debug(`Product missing price, skipping: ${title}`);
        return null;
      }

      // Extract original price (optional)
      const originalPriceElement = await element.$(selectors.originalPrice);
      const originalPriceText = originalPriceElement
        ? (await originalPriceElement.textContent())?.trim()
        : null;

      const originalPrice = parsePrice(originalPriceText);

      // Calculate or extract discount percentage
      let discountPercentage: number | undefined;
      const discountBadgeElement = await element.$(selectors.discountBadge);
      if (discountBadgeElement) {
        const badgeText = (await discountBadgeElement.textContent())?.trim();
        const match = badgeText?.match(/(\d+)%/);
        if (match) {
          discountPercentage = parseInt(match[1], 10);
        }
      }

      // If no badge, calculate from prices
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
        // Try multiple attributes (src, data-src, srcset)
        imageUrl =
          (await imageElement.getAttribute('src')) ||
          (await imageElement.getAttribute('data-src')) ||
          (await imageElement.getAttribute('data-lazy-src')) ||
          undefined;

        // Extract from srcset if needed
        if (!imageUrl) {
          const srcset = await imageElement.getAttribute('srcset');
          if (srcset) {
            // Take first URL from srcset
            imageUrl = srcset.split(',')[0].trim().split(' ')[0];
          }
        }

        // Convert relative URLs to absolute
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
            : new URL(href, 'https://www.ah.nl').href;
        }
      }

      // Extract description (optional)
      const descriptionElement = await element.$(selectors.description);
      const description = descriptionElement
        ? (await descriptionElement.textContent())?.trim()
        : undefined;

      // Extract unit info (optional)
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
   * Scrape all products from Albert Heijn
   */
  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    // Initialize browser
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);

      // Navigate to bonus page
      await page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      this.logger.success('Page loaded');

      // Handle cookie consent
      await this.handleCookieConsent(page);

      // Wait for product grid to load
      try {
        await page.waitForSelector(selectors.productGrid, { timeout: 10000 });
      } catch (error) {
        this.logger.warning('Product grid not found with primary selector, trying alternatives');

        // Try waiting for product cards directly
        await page.waitForSelector(selectors.productCard, { timeout: 10000 });
      }

      // Scroll to load all products (AH likely uses infinite scroll)
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

        // Small delay between products
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      this.logger.success(`Scraped ${products.length} products from Albert Heijn`);
    } catch (error) {
      this.logger.error('Error during scraping', error);
      throw error;
    }

    return products;
  }

  /**
   * Scroll page to load all lazy-loaded products
   * Albert Heijn uses infinite scroll
   */
  private async scrollToLoadAll(page: any): Promise<void> {
    try {
      this.logger.info('Scrolling to load all products...');

      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 30; // AH may have many products

      while (scrollAttempts < maxScrollAttempts) {
        // Get current page height
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        // If height hasn't changed for 3 attempts, we've likely reached the bottom
        if (currentHeight === previousHeight) {
          if (scrollAttempts > 0) {
            break; // Already tried once with no change
          }
        }

        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        // Wait for potential lazy loading
        await page.waitForTimeout(1500);

        // Try to click "Load More" button if it exists
        try {
          const loadMoreButton = await page.$(selectors.loadMoreButton);
          if (loadMoreButton) {
            const isVisible = await loadMoreButton.isVisible();
            if (isVisible) {
              await loadMoreButton.click();
              this.logger.debug('Clicked load more button');
              await page.waitForTimeout(2000);
            }
          }
        } catch (error) {
          // No load more button, continue scrolling
        }

        previousHeight = currentHeight;
        scrollAttempts++;

        // Log progress every 10 attempts
        if (scrollAttempts % 10 === 0) {
          const productCount = await page.$$(selectors.productCard);
          this.logger.info(`Scroll attempt ${scrollAttempts}: ${productCount.length} products loaded`);
        }
      }

      this.logger.success('Finished scrolling');
    } catch (error) {
      this.logger.warning('Error during scrolling', error);
    }
  }
}
