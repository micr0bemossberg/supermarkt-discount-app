/**
 * Jumbo Scraper
 * Scrapes discount offers from Jumbo website
 */

import { BaseScraper } from '../base/BaseScraper';
import { CATEGORY_KEYWORDS } from '../../config/constants';
import type { ScrapedProduct } from '@supermarkt-deals/shared';

export class JumboScraper extends BaseScraper {
  constructor() {
    super('jumbo', 'https://www.jumbo.com/aanbiedingen');
  }

  /**
   * Determine category from product title
   */
  private detectCategory(title: string): string {
    const lowerTitle = title.toLowerCase();

    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (lowerTitle.includes(keyword)) {
        return category;
      }
    }

    return 'overig';
  }

  /**
   * Parse price from text (handles Dutch format like "8,99" or "€8.99")
   */
  private parsePrice(text: string | null): number | undefined {
    if (!text) return undefined;

    // Match price patterns: €8,99 or 8.99 or 8,99
    const match = text.match(/€?\s*(\d+)[,.](\d{2})/);
    if (match) {
      return parseFloat(`${match[1]}.${match[2]}`);
    }
    return undefined;
  }

  /**
   * Extract validity dates from page or element
   */
  private parseValidityDates(text: string): { validFrom: Date; validUntil: Date } {
    const today = new Date();
    const currentYear = today.getFullYear();

    // Try to parse "Geldig van wo 28 jan t/m di 3 feb" format
    const dateMatch = text.match(/(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(?:t\/m|tot|-)\s*(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)/i);

    if (dateMatch) {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11
      };

      const startDay = parseInt(dateMatch[1], 10);
      const startMonth = months[dateMatch[2].toLowerCase()];
      const endDay = parseInt(dateMatch[3], 10);
      const endMonth = months[dateMatch[4].toLowerCase()];

      const validFrom = new Date(currentYear, startMonth, startDay);
      const validUntil = new Date(currentYear, endMonth, endDay, 23, 59, 59);

      // Handle year rollover
      if (validUntil < validFrom) {
        validUntil.setFullYear(currentYear + 1);
      }

      return { validFrom, validUntil };
    }

    // Default: Monday to Sunday of current week
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { validFrom: monday, validUntil: sunday };
  }

  /**
   * Scroll through horizontal carousels to load all items
   */
  private async scrollCarousels(page: any): Promise<void> {
    try {
      // Find carousel/slider containers
      const carouselSelectors = [
        '[class*="carousel"]',
        '[class*="slider"]',
        '[class*="scroller"]',
        '[class*="swiper"]'
      ];

      for (const selector of carouselSelectors) {
        const carousels = await page.$$(selector);
        for (const carousel of carousels) {
          // Click next button multiple times to scroll through
          const nextButtons = await carousel.$$('[class*="next"], [class*="arrow-right"], button[aria-label*="next"], button[aria-label*="volgende"]');
          for (const btn of nextButtons) {
            try {
              for (let i = 0; i < 10; i++) {
                const isVisible = await btn.isVisible();
                if (isVisible) {
                  await btn.click();
                  await page.waitForTimeout(500);
                }
              }
            } catch (e) {
              // Button may disappear after reaching end
            }
          }
        }
      }
    } catch (error) {
      this.logger.warning('Error scrolling carousels', error);
    }
  }

  /**
   * Scroll page to load all lazy-loaded products
   */
  private async scrollToLoadAll(page: any): Promise<void> {
    try {
      this.logger.info('Scrolling page to load all products...');

      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20;

      while (scrollAttempts < maxScrollAttempts) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        if (currentHeight === previousHeight) {
          break;
        }

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);

        previousHeight = currentHeight;
        scrollAttempts++;
      }

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      this.logger.success('Finished scrolling');
    } catch (error) {
      this.logger.warning('Error during scrolling', error);
    }
  }

  protected async scrapeProducts(): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const page = await this.initBrowser();

    try {
      this.logger.info(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 90000 });

      this.logger.success('Page loaded');
      await this.handleCookieConsent(page);

      // Wait for dynamic content
      this.logger.info('Waiting for content to render...');
      await page.waitForTimeout(5000);

      // Scroll through horizontal carousels ("Nu extra goedkoop" section)
      this.logger.info('Scrolling through carousels...');
      await this.scrollCarousels(page);

      // Scroll page to load all "Per gangpad" sections
      await this.scrollToLoadAll(page);

      // Try multiple selectors for product cards
      const selectors = [
        // Main product cards
        '[class*="promotion-card"]',
        '[class*="product-card"]',
        'article[class*="jum-card"]',
        '[class*="ProductCard"]',
        '[data-testid*="product"]',
        // Carousel items
        '[class*="carousel"] [class*="item"]',
        '[class*="slider"] [class*="slide"]',
        // Grid items
        '[class*="grid"] > div[class*="card"]',
        '[class*="aisle"] [class*="card"]'
      ];

      let articles: any[] = [];
      for (const selector of selectors) {
        const found = await page.$$(selector);
        if (found.length > 0) {
          this.logger.info(`Found ${found.length} products with selector: ${selector}`);
          articles = [...articles, ...found];
        }
      }

      // Deduplicate by getting unique elements
      const uniqueArticles = [];
      const seenText = new Set();
      for (const article of articles) {
        const text = await article.textContent();
        if (text && !seenText.has(text.trim())) {
          seenText.add(text.trim());
          uniqueArticles.push(article);
        }
      }
      articles = uniqueArticles;

      if (articles.length === 0) {
        // Fallback: try to find any links to product pages
        this.logger.warning('No product cards found, trying links...');
        articles = await page.$$('a[href*="/producten/"], a[href*="/aanbiedingen/"]');
      }

      this.logger.success(`Found ${articles.length} unique product elements`);

      if (articles.length === 0) {
        throw new Error('No products found on Jumbo');
      }

      // Try to get global validity info from page
      const pageText = await page.textContent('body') || '';
      const globalDates = this.parseValidityDates(pageText);

      // Extract products
      for (let i = 0; i < articles.length; i++) {
        try {
          const article = articles[i];
          const articleText = await article.textContent() || '';

          // Extract title
          let title = '';
          const titleSelectors = [
            '[class*="title"]',
            '[class*="name"]',
            'h2', 'h3', 'h4',
            '[class*="heading"]'
          ];

          for (const sel of titleSelectors) {
            const titleEl = await article.$(sel);
            if (titleEl) {
              title = (await titleEl.textContent())?.trim() || '';
              if (title && title.length > 3) break;
            }
          }

          // Fallback: get from link text
          if (!title || title.length < 3) {
            const link = await article.$('a');
            if (link) {
              const linkText = await link.textContent();
              if (linkText) {
                const lines = linkText.trim().split('\n').filter((l: string) => l.trim() && l.trim().length > 3);
                title = lines[0] || `Jumbo Aanbieding ${i + 1}`;
              }
            }
          }

          if (!title || title.length < 3) {
            title = `Jumbo Aanbieding ${i + 1}`;
          }

          // Extract product URL
          let productUrl: string | undefined;
          const link = await article.$('a[href*="/producten/"], a[href*="/aanbiedingen/"]');
          if (link) {
            const href = await link.getAttribute('href');
            if (href) {
              productUrl = href.startsWith('http') ? href : `https://www.jumbo.com${href}`;
            }
          }

          // Extract image - try multiple approaches
          let imageUrl: string | undefined;

          // Try picture source first (higher quality)
          const sourceEl = await article.$('picture source');
          if (sourceEl) {
            const srcset = await sourceEl.getAttribute('srcset');
            if (srcset) {
              const parts = srcset.split(',').map((s: string) => s.trim());
              const lastPart = parts[parts.length - 1] || parts[0];
              if (lastPart) {
                imageUrl = lastPart.split(' ')[0];
              }
            }
          }

          // Try img with srcset
          if (!imageUrl) {
            const img = await article.$('img');
            if (img) {
              const srcset = await img.getAttribute('srcset');
              if (srcset) {
                const parts = srcset.split(',').map((s: string) => s.trim());
                const lastPart = parts[parts.length - 1] || parts[0];
                if (lastPart) {
                  imageUrl = lastPart.split(' ')[0];
                }
              }

              if (!imageUrl) {
                imageUrl = await img.getAttribute('src') ||
                           await img.getAttribute('data-src') ||
                           await img.getAttribute('data-lazy-src');
              }
            }
          }

          // Make image URL absolute
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://www.jumbo.com${imageUrl}`;
          }

          // Filter out placeholder images
          if (imageUrl && (imageUrl.includes('data:') || imageUrl.includes('blank') || imageUrl.includes('placeholder'))) {
            imageUrl = undefined;
          }

          // Extract prices - look for original (strikethrough) and discount price
          let originalPrice: number | undefined;
          let discountPrice: number | undefined;

          // Original price (usually in strikethrough or "was" element)
          const origPriceSelectors = ['s', 'del', '[class*="was"]', '[class*="original"]', '[class*="strike"]', '[class*="old"]'];
          for (const sel of origPriceSelectors) {
            const el = await article.$(sel);
            if (el) {
              const text = await el.textContent();
              originalPrice = this.parsePrice(text);
              if (originalPrice) break;
            }
          }

          // Discount price (current price)
          const discountPriceSelectors = [
            '[class*="price"]:not(s):not(del)',
            '[class*="promotion-price"]',
            '[class*="current"]',
            '[class*="sale"]'
          ];

          for (const sel of discountPriceSelectors) {
            const el = await article.$(sel);
            if (el) {
              const text = await el.textContent();
              const price = this.parsePrice(text);
              if (price && price !== originalPrice) {
                discountPrice = price;
                break;
              }
            }
          }

          // Fallback: extract any price from text
          if (!discountPrice) {
            const priceMatches = articleText.match(/€?\s*(\d+)[,.](\d{2})/g);
            if (priceMatches) {
              const prices = priceMatches.map((p: string) => this.parsePrice(p)).filter(Boolean) as number[];
              if (prices.length >= 2) {
                // Assume higher is original, lower is discount
                originalPrice = Math.max(...prices);
                discountPrice = Math.min(...prices);
              } else if (prices.length === 1) {
                discountPrice = prices[0];
              }
            }
          }

          // Default price if none found
          if (!discountPrice) {
            discountPrice = 0;
          }

          // Extract deal label (e.g., "voor 6,50", "2e gratis", "25% korting")
          let unitInfo: string | undefined;
          let discountPercentage: number | undefined;

          // Look for deal labels in specific elements
          const dealLabelSelectors = [
            '[class*="label"]',
            '[class*="badge"]',
            '[class*="tag"]',
            '[class*="promotion"]',
            '[class*="discount"]',
            '[class*="korting"]',
            '[class*="action"]',
            'span[style*="background"]' // Often deal labels have colored backgrounds
          ];

          for (const sel of dealLabelSelectors) {
            const elements = await article.$$(sel);
            for (const el of elements) {
              const text = (await el.textContent())?.trim();
              if (text && text.length > 0 && text.length < 40) {
                // Check if it looks like a deal label
                const lowerText = text.toLowerCase();
                if (lowerText.includes('voor') || lowerText.includes('gratis') ||
                    lowerText.includes('%') || lowerText.includes('korting') ||
                    lowerText.includes('combi') || lowerText.includes('+')) {
                  unitInfo = text;

                  // Extract percentage from label like "25% korting"
                  const percentMatch = text.match(/(\d+)\s*%/);
                  if (percentMatch) {
                    discountPercentage = parseInt(percentMatch[1], 10);
                  }

                  // Extract price from label like "voor 6,50" or "2 voor 5,00"
                  const priceInLabelMatch = text.match(/voor\s*€?\s*(\d+)[,.](\d{2})/i);
                  if (priceInLabelMatch && !discountPrice) {
                    discountPrice = parseFloat(`${priceInLabelMatch[1]}.${priceInLabelMatch[2]}`);
                  }

                  break;
                }
              }
            }
            if (unitInfo) break;
          }

          // Fallback: search in article text for deal patterns
          if (!unitInfo) {
            const dealPatterns = [
              /\d+\s*%\s*korting/i,
              /\d+\s*\+\s*\d+\s*gratis/i,
              /\d+e?\s*(halve prijs|gratis)/i,
              /\d+\s*voor\s*€?\s*[\d,.]+/i,
              /combikorting/i
            ];

            for (const pattern of dealPatterns) {
              const match = articleText.match(pattern);
              if (match) {
                unitInfo = match[0].trim();

                // Extract percentage
                const percentMatch = match[0].match(/(\d+)\s*%/);
                if (percentMatch && !discountPercentage) {
                  discountPercentage = parseInt(percentMatch[1], 10);
                }

                break;
              }
            }
          }

          // Try to get validity dates from article
          const { validFrom, validUntil } = this.parseValidityDates(articleText) || globalDates;

          // Calculate discount percentage from prices if not found in label
          if (!discountPercentage && originalPrice && discountPrice && originalPrice > discountPrice) {
            discountPercentage = Math.round((1 - discountPrice / originalPrice) * 100);
          }

          // Detect category
          const categorySlug = this.detectCategory(title);

          products.push({
            title,
            description: unitInfo,
            original_price: originalPrice,
            discount_price: discountPrice,
            discount_percentage: discountPercentage,
            valid_from: validFrom,
            valid_until: validUntil,
            category_slug: categorySlug,
            product_url: productUrl,
            image_url: imageUrl,
            unit_info: unitInfo,
          });

          this.logger.debug(`Scraped: ${title} - €${discountPrice} (was €${originalPrice})`);
        } catch (err) {
          this.logger.warning(`Failed to parse article ${i}:`, err);
        }
      }

      this.logger.success(`Scraped ${products.length} products from Jumbo`);
    } catch (error) {
      this.logger.error('Error', error);
      throw error;
    }

    return products;
  }
}
