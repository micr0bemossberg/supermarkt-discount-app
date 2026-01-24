/**
 * Image Processor Utility
 * Downloads, optimizes, and uploads product images to Supabase Storage
 */

import sharp from 'sharp';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { IMAGE_CONFIG, STORAGE_CONFIG } from '../config/constants';
import { createLogger } from './logger';
import type { SupermarketSlug } from '@supermarkt-deals/shared';

const logger = createLogger('ImageProcessor');

export interface ProcessedImage {
  publicUrl: string;
  storagePath: string;
  hash: string;
  sizeBytes: number;
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error(`Failed to download image from ${url}`, error);
    throw error;
  }
}

/**
 * Generate SHA-256 hash from buffer
 */
function generateHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Optimize image using Sharp
 * - Resize to max dimensions
 * - Convert to WebP format
 * - Compress to specified quality
 */
async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    const optimized = await sharp(buffer)
      .resize(IMAGE_CONFIG.MAX_WIDTH, IMAGE_CONFIG.MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_CONFIG.QUALITY })
      .toBuffer();

    logger.debug(
      `Image optimized: ${buffer.length} bytes → ${optimized.length} bytes (${Math.round((optimized.length / buffer.length) * 100)}%)`
    );

    return optimized;
  } catch (error) {
    logger.error('Failed to optimize image', error);
    throw error;
  }
}

/**
 * Generate storage path for image
 * Format: {supermarket}/{year}/{month}/{hash}.webp
 */
function generateStoragePath(
  supermarketSlug: SupermarketSlug,
  hash: string
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `${supermarketSlug}/${year}/${month}/${hash}.webp`;
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToStorage(
  buffer: Buffer,
  path: string
): Promise<string> {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .upload(path, buffer, {
        contentType: 'image/webp',
        cacheControl: '31536000', // 1 year
        upsert: true, // Overwrite if exists
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .getPublicUrl(path);

    return publicUrlData.publicUrl;
  } catch (error) {
    logger.error(`Failed to upload image to ${path}`, error);
    throw error;
  }
}

/**
 * Check if image already exists in storage
 */
async function imageExists(path: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .list(path.split('/').slice(0, -1).join('/'), {
        search: path.split('/').pop(),
      });

    if (error) {
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Process product image: download, optimize, and upload
 * Returns public URL and storage path
 */
export async function processProductImage(
  imageUrl: string,
  supermarketSlug: SupermarketSlug
): Promise<ProcessedImage | null> {
  try {
    logger.info(`Processing image: ${imageUrl}`);

    // Download original image
    const originalBuffer = await downloadImage(imageUrl);

    // Generate hash for deduplication
    const hash = generateHash(originalBuffer);

    // Generate storage path
    const storagePath = generateStoragePath(supermarketSlug, hash);

    // Check if image already exists
    const exists = await imageExists(storagePath);
    if (exists) {
      logger.debug(`Image already exists at ${storagePath}, skipping upload`);

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_CONFIG.BUCKET_NAME)
        .getPublicUrl(storagePath);

      return {
        publicUrl: publicUrlData.publicUrl,
        storagePath,
        hash,
        sizeBytes: originalBuffer.length,
      };
    }

    // Optimize image
    const optimizedBuffer = await optimizeImage(originalBuffer);

    // Check file size
    const sizeMB = optimizedBuffer.length / (1024 * 1024);
    if (sizeMB > IMAGE_CONFIG.MAX_FILE_SIZE_MB) {
      logger.warning(
        `Image too large (${sizeMB.toFixed(2)}MB), skipping: ${imageUrl}`
      );
      return null;
    }

    // Upload to Supabase Storage
    const publicUrl = await uploadToStorage(optimizedBuffer, storagePath);

    logger.success(`Image uploaded: ${storagePath}`);

    return {
      publicUrl,
      storagePath,
      hash,
      sizeBytes: optimizedBuffer.length,
    };
  } catch (error) {
    logger.error(`Failed to process image: ${imageUrl}`, error);
    return null;
  }
}

/**
 * Process multiple images in parallel with concurrency limit
 */
export async function processImagesInBatch(
  imageUrls: string[],
  supermarketSlug: SupermarketSlug,
  concurrency: number = 3
): Promise<(ProcessedImage | null)[]> {
  const results: (ProcessedImage | null)[] = [];

  for (let i = 0; i < imageUrls.length; i += concurrency) {
    const batch = imageUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((url) => processProductImage(url, supermarketSlug))
    );
    results.push(...batchResults);
  }

  return results;
}
