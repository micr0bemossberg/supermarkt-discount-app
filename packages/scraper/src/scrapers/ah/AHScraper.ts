/**
 * Albert Heijn Scraper
 * Scrapes discount offers (bonus products) from Albert Heijn website
 */

import { BaseScraper } from '../base/BaseScraper';
import { ahSelectors as selectors } from './selectors';
import { parsePrice } from '../../utils/deduplication';
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
   * Parse discount label text to extract price if possible
   * Examples: "2e gratis", "25%", "voor 0.99", "2 voor 2.89", "1+1"
   */
  private parseDiscountLabel(text: string | null): { price?: number; percentage?: number; label: string } {
    if (!text) return { label: '' };

    const label = text.replace(/\s+/g, ' ').trim();

    // Try to extract price from "voor X.XX" or "X voor X.XX" patterns
    const priceMatch = label.match(/voor\s*€?\s*(\d+)[,.](\d{2})/i);
    if (priceMatch) {
      const price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`);
      return { price, label };
    }

    // Try "X.XX" standalone price
    const standalonePrice = label.match(/^€?\s*(\d+)[,.](\d{2})$/);
    if (standalonePrice) {
      const price = parseFloat(`${standalonePrice[1]}.${standalonePrice[2]}`);
      return { price, label };
    }

    // Extract percentage
    const percentMatch = label.match(/(\d+)\s*%/);
    if (percentMatch) {
      return { percentage: parseInt(percentMatch[1], 10), label };
    }

    return { label };
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

      // Extract discount label (AH uses labels like "2e gratis", "25%", "voor 0.99")
      const discountLabelElement = await element.$(selectors.discountPrice);
      const discountLabelText = discountLabelElement
        ? (await discountLabelElement.textContent())?.trim()
        : null;

      const { price: discountPrice, percentage: discountPercentage, label: discountLabel } =
        this.parseDiscountLabel(discountLabelText);

      // AH bonus cards don't always show prices, so we use 0 as placeholder
      // The discount label itself is the valuable info
      const finalPrice = discountPrice || 0;

      // Extract original price (optional, rarely shown on bonus cards)
      const originalPriceElement = await element.$(selectors.originalPrice);
      const originalPriceText = originalPriceElement
        ? (await originalPriceElement.textContent())?.trim()
        : null;
      const originalPrice = parsePrice(originalPriceText);

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

      // Extract description/unit info (optional)
      const descriptionElement = await element.$(selectors.description);
      const descriptionText = descriptionElement
        ? (await descriptionElement.textContent())?.trim()
        : undefined;

      // Combine discount label with description
      const description = discountLabel
        ? (descriptionText ? `${discountLabel} - ${descriptionText}` : discountLabel)
        : descriptionText;

      // Detect category
      const categorySlug = this.detectCategory(title);

      // Get validity dates
      const { validFrom, validUntil } = this.getValidityDates();

      const scrapedProduct: ScrapedProduct = {
        title,
        description,
        original_price: originalPrice ?? undefined,
        discount_price: finalPrice,
        discount_percentage: discountPercentage,
        image_url: imageUrl,
        product_url: productUrl,
        unit_info: discountLabel || descriptionText, // Store discount label as unit info
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
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      this.logger.success('Page loaded');

      // Handle cookie consent
      await this.handleCookieConsent(page);

      // Wait extra time for dynamic content to load
      await page.waitForTimeout(3000);

      // Check if we hit the "aanbiedingen kunnen niet worden geladen" error
      const errorText = await page.locator('text=aanbiedingen kunnen niet worden geladen').count();
      if (errorText > 0) {
        this.logger.warning('AH returned error page, trying category pages instead');
        return await this.scrapeFromCategories(page);
      }

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

  /**
   * Fallback: Scrape from individual category pages
   * Used when main bonus page is blocked by bot detection
   */
  private async scrapeFromCategories(page: any): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];

    // AH bonus category URLs
    const categoryUrls = [
      'https://www.ah.nl/bonus/groente-aardappelen',
      'https://www.ah.nl/bonus/fruit-verse-sappen',
      'https://www.ah.nl/bonus/vlees',
      'https://www.ah.nl/bonus/vis',
      'https://www.ah.nl/bonus/kaas',
      'https://www.ah.nl/bonus/zuivel-eieren',
      'https://www.ah.nl/bonus/bakkerij',
      'https://www.ah.nl/bonus/borrel-chips-snacks',
      'https://www.ah.nl/bonus/koffie-thee',
      'https://www.ah.nl/bonus/frisdrank-sappen-water',
      'https://www.ah.nl/bonus/bier-wijn',
      'https://www.ah.nl/bonus/diepvries',
    ];

    for (const url of categoryUrls) {
      try {
        this.logger.info(`Scraping category: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Check for error page
        const errorCount = await page.locator('text=kunnen niet worden geladen').count();
        if (errorCount > 0) {
          this.logger.warning(`Category ${url} also blocked, skipping`);
          continue;
        }

        // Wait for products
        try {
          await page.waitForSelector(selectors.productCard, { timeout: 5000 });
        } catch {
          this.logger.warning(`No products found in ${url}`);
          continue;
        }

        // Extract products from this category
        const productElements = await page.$$(selectors.productCard);
        this.logger.info(`Found ${productElements.length} products in category`);

        for (const element of productElements) {
          const product = await this.parseProduct(element);
          if (product) {
            products.push(product);
          }
        }

        // Small delay between categories
        await page.waitForTimeout(1000);
      } catch (error) {
        this.logger.warning(`Error scraping category ${url}`, error);
      }
    }

    this.logger.success(`Scraped ${products.length} products from categories`);
    return products;
  }
}
