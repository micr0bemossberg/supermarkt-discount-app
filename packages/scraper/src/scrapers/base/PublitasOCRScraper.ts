import sharp from 'sharp';
import { BaseScraper } from './BaseScraper';
import { GeminiExtractor, GEMINI_DEFAULTS } from '../../gemini';
import { downloadImageAsBuffer } from '../../ocr/publitasImages';
import { ALL_CATEGORY_SLUGS } from '../../config/constants';
import type { ScrapedProduct, SupermarketSlug } from '@supermarkt-deals/shared';
import type { ExtractionContext, ImageChunk } from '../../gemini/types';

interface SpreadPage {
  imageUrl: string;
  pageIndex: number;
}

export abstract class PublitasOCRScraper extends BaseScraper {
  private extractor: GeminiExtractor;

  constructor(supermarketSlug: SupermarketSlug, baseUrl: string) {
    super(supermarketSlug, baseUrl);
    this.extractor = new GeminiExtractor({
      ...GEMINI_DEFAULTS,
      apiKeys: Array.from({ length: 50 }, (_, i) => process.env[`gemini_api_key${i + 1}`])
        .filter((k): k is string => !!k),
    });
  }

  /** Human-readable name for Gemini prompt context */
  abstract getSupermarketName(): string;

  /** Subclasses provide the Publitas folder URL */
  abstract getPublitasUrl(): string | Promise<string>;

  /** Override if Publitas URL is dynamic and needs browser to resolve */
  protected needsBrowserForUrl(): boolean {
    return false;
  }

  /** Page indices to skip (e.g., [0] for cover page) */
  protected getSkipPages(): number[] {
    return [0];
  }

  /** Extra Gemini prompt context */
  protected getPromptHints(): string {
    return '';
  }

  /**
   * Test-OCR override: download only 1 flyer page, send to Gemini, return raw products.
   */
  public async runTestOcr(): Promise<ScrapedProduct[]> {
    this.startTime = Date.now();
    this.logger.info(`[TEST-OCR] Starting Publitas OCR test`);

    try {
      if (this.needsBrowserForUrl()) {
        await this.initBrowser();
      }
      const publitasUrl = await this.getPublitasUrl();
      this.logger.info(`[TEST-OCR] Publitas URL: ${publitasUrl}`);

      const spreads = await this.fetchSpreads(publitasUrl);
      this.logger.info(`[TEST-OCR] Found ${spreads.length} pages, using first non-skipped page`);

      const skipPages = new Set(this.getSkipPages());
      const firstPage = spreads.find((s) => !skipPages.has(s.pageIndex));

      if (!firstPage) {
        this.logger.error('[TEST-OCR] No pages available after skipping');
        return [];
      }

      const buffer = await downloadImageAsBuffer(firstPage.imageUrl);
      const chunks: ImageChunk[] = [{
        buffer,
        index: firstPage.pageIndex,
        totalChunks: 1,
      }];

      this.logger.info(`[TEST-OCR] Downloaded page ${firstPage.pageIndex}`);

      const context: ExtractionContext = {
        supermarketSlug: this.supermarketSlug,
        supermarketName: this.getSupermarketName(),
        categorySlugList: ALL_CATEGORY_SLUGS,
        promptHints: this.getPromptHints(),
      };

      const result = await this.extractor.extractProducts(chunks, context);
      this.logger.info(
        `[TEST-OCR] Extracted ${result.products.length} products ` +
        `(${result.tokensUsed} tokens)`
      );

      return result.products;
    } finally {
      await this.cleanup();
      const endTime = Date.now();
      this.logger.info(`[TEST-OCR] Duration: ${Math.round((endTime - this.startTime) / 1000)}s`);
    }
  }

  async scrapeProducts(): Promise<ScrapedProduct[]> {
    this.logger.info('Starting Publitas OCR scrape');

    // 1. Resolve Publitas URL (may need browser)
    if (this.needsBrowserForUrl()) {
      await this.initBrowser();
    }
    const publitasUrl = await this.getPublitasUrl();
    this.logger.info(`Publitas URL: ${publitasUrl}`);

    // 2. Fetch spreads.json
    const spreads = await this.fetchSpreads(publitasUrl);
    this.logger.info(`Found ${spreads.length} pages`);

    // 3. Download flyer page images
    const skipPages = new Set(this.getSkipPages());
    const pagesToProcess = spreads.filter((s) => !skipPages.has(s.pageIndex));

    const chunks: ImageChunk[] = [];
    for (const page of pagesToProcess) {
      try {
        const buffer = await downloadImageAsBuffer(page.imageUrl);
        chunks.push({
          buffer,
          index: page.pageIndex,
          totalChunks: spreads.length,
        });
      } catch (error) {
        this.logger.warning(`Failed to download page ${page.pageIndex}: ${error}`);
      }
    }

    if (chunks.length === 0) {
      this.logger.error('No pages downloaded');
      return [];
    }

    // 4. Send to GeminiExtractor
    const context: ExtractionContext = {
      supermarketSlug: this.supermarketSlug,
      supermarketName: this.getSupermarketName(),
      categorySlugList: ALL_CATEGORY_SLUGS,
      promptHints: this.getPromptHints(),
    };

    const result = await this.extractor.extractProducts(chunks, context);
    this.logger.info(
      `Extracted ${result.products.length} products ` +
      `(${result.chunksProcessed} chunks OK, ${result.chunksFailed} failed, ${result.tokensUsed} tokens)`
    );

    // 5. Crop individual product images from flyer pages using bounding boxes
    await this.cropProductImages(result.products, chunks);

    return result.products;
  }

  private async fetchSpreads(publitasUrl: string): Promise<SpreadPage[]> {
    // Try common Publitas API patterns
    const urls = [
      `${publitasUrl}/spreads.json`,
      `${publitasUrl.replace(/\/$/, '')}/spreads.json`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        return this.parseSpreadsData(data);
      } catch {
        continue;
      }
    }

    throw new Error(`Failed to fetch spreads.json from ${publitasUrl}`);
  }

  private parseSpreadsData(data: unknown): SpreadPage[] {
    const pages: SpreadPage[] = [];

    if (!Array.isArray(data)) return pages;

    for (let i = 0; i < data.length; i++) {
      const spread = data[i];
      if (spread && typeof spread === 'object') {
        // Try various Publitas formats:
        // 1. Direct: spread.imageUrl / spread.image_url / spread.url
        // 2. Nested: spread.pages[0].images.at2400 (relative path, needs CDN prefix)
        // 3. Nested: spread.pages[0].imageUrl
        let imageUrl: string | null = null;

        if (typeof spread.imageUrl === 'string') {
          imageUrl = spread.imageUrl;
        } else if (typeof spread.image_url === 'string') {
          imageUrl = spread.image_url;
        } else if (typeof spread.url === 'string') {
          imageUrl = spread.url;
        } else if (spread.pages?.[0]?.images) {
          // Publitas nested format: prefer at1600 (662KB) — good OCR quality without overwhelming Gemini
          const images = spread.pages[0].images;
          const path = images.at1600 || images.at2000 || images.at1200 || images.at2400;
          if (typeof path === 'string') {
            imageUrl = path.startsWith('http') ? path : `https://view.publitas.com${path}`;
          }
        } else if (typeof spread.pages?.[0]?.imageUrl === 'string') {
          imageUrl = spread.pages[0].imageUrl;
        }

        if (imageUrl) {
          pages.push({ imageUrl, pageIndex: i });
        }
      }
    }

    return pages;
  }

  /**
   * Crop individual product images from flyer pages using Gemini bounding boxes.
   * Sets image_url as a base64 data URI on each product that has bbox data.
   * The BaseScraper image processor will later upload these to Supabase Storage.
   */
  private async cropProductImages(
    products: ScrapedProduct[],
    chunks: ImageChunk[],
  ): Promise<void> {
    // Build chunk buffer map: chunkIndex → buffer
    const chunkBuffers = new Map<number, Buffer>();
    for (const chunk of chunks) {
      chunkBuffers.set(chunk.index, chunk.buffer);
    }

    let cropped = 0;
    let skipped = 0;

    for (const product of products) {
      const p = product as any;
      const bbox = p._bbox;
      const chunkIndex = p._chunkIndex;

      if (!bbox || chunkIndex === undefined) {
        skipped++;
        continue;
      }

      const pageBuffer = chunkBuffers.get(chunkIndex);
      if (!pageBuffer) {
        skipped++;
        continue;
      }

      try {
        const metadata = await sharp(pageBuffer).metadata();
        const imgW = metadata.width || 1;
        const imgH = metadata.height || 1;

        // Convert percentage bbox to pixel coordinates with padding
        const pad = 2; // 2% padding
        const left = Math.max(0, Math.round(((bbox.x - pad) / 100) * imgW));
        const top = Math.max(0, Math.round(((bbox.y - pad) / 100) * imgH));
        const width = Math.min(imgW - left, Math.round(((bbox.w + pad * 2) / 100) * imgW));
        const height = Math.min(imgH - top, Math.round(((bbox.h + pad * 2) / 100) * imgH));

        if (width < 20 || height < 20) {
          skipped++;
          continue;
        }

        const croppedBuffer = await sharp(pageBuffer)
          .extract({ left, top, width, height })
          .webp({ quality: 80 })
          .toBuffer();

        // Store as data URI — BaseScraper's image processor will detect and upload it
        product.image_url = `data:image/webp;base64,${croppedBuffer.toString('base64')}`;
        cropped++;
      } catch {
        skipped++;
      }

      // Clean up transient metadata
      delete p._bbox;
      delete p._chunkIndex;
    }

    if (cropped > 0) {
      this.logger.info(`Cropped ${cropped} product images from flyer pages (${skipped} skipped)`);
    }
  }
}
