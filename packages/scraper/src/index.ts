#!/usr/bin/env node

/**
 * Scraper CLI Entry Point
 * Command-line interface for running supermarket scrapers
 */

import { AHScraper } from './scrapers/ah/AHScraper';
import { JumboScraper } from './scrapers/jumbo/JumboScraper';
import { AldiScraper } from './scrapers/aldi/AldiScraper';
import { DirkScraper } from './scrapers/dirk/DirkScraper';
import { VomarScraper } from './scrapers/vomar/VomarScraper';
import { PicnicScraper } from './scrapers/picnic/PicnicScraper';
import { JoybuyScraper } from './scrapers/joybuy/JoybuyScraper';
import { MegafoodstunterScraper } from './scrapers/megafoodstunter/MegafoodstunterScraper';
// import { ButlonScraper } from './scrapers/butlon/ButlonScraper'; // Disabled: site down (ERR_CONNECTION_TIMED_OUT)
import { HoogvlietScraper } from './scrapers/hoogvliet/HoogvlietScraper';
import { ActionScraper } from './scrapers/action/ActionScraper';
// import { FlinkScraper } from './scrapers/flink/FlinkScraper'; // Disabled: Flink exited Netherlands
import { KruidvatScraper } from './scrapers/kruidvat/KruidvatScraper';
import { DekamarktScraper } from './scrapers/dekamarkt/DekamarktScraper';
import { testConnection } from './config/supabase';
import { deactivateExpiredProducts, getActiveProductCount } from './database/products';
import { getScraperStats } from './database/scrapeLogs';
import { logger } from './utils/logger';
import type { SupermarketSlug } from '@supermarkt-deals/shared';

/**
 * Get scraper instance by slug
 */
function getScraper(slug: SupermarketSlug) {
  switch (slug) {
    case 'ah':
      return new AHScraper();
    case 'jumbo':
      return new JumboScraper();
    case 'aldi':
      return new AldiScraper();
    case 'dirk':
      return new DirkScraper();
    case 'vomar':
      return new VomarScraper();
    case 'picnic':
      return new PicnicScraper();
    case 'joybuy':
      return new JoybuyScraper();
    case 'megafoodstunter':
      return new MegafoodstunterScraper();
    case 'butlon':
      throw new Error('Butlon is disabled — site is down');
    case 'hoogvliet':
      return new HoogvlietScraper();
    case 'action':
      return new ActionScraper();
    case 'flink':
      throw new Error('Flink is disabled — exited Netherlands');
    case 'kruidvat':
      return new KruidvatScraper();
    case 'dekamarkt':
      return new DekamarktScraper();
    default:
      throw new Error(`Unknown supermarket: ${slug}`);
  }
}

/**
 * Run scraper for a specific supermarket
 */
async function runScraper(slug: SupermarketSlug) {
  logger.info(`========================================`);
  logger.info(`Starting ${slug.toUpperCase()} scraper`);
  logger.info(`========================================`);

  const scraper = getScraper(slug);
  const result = await scraper.run();

  logger.info(`========================================`);
  if (result.success) {
    logger.success(`✓ ${slug.toUpperCase()} scraper completed successfully`);
    logger.info(`  Products scraped: ${result.products_scraped}`);
    logger.info(`  Products inserted: ${result.products_inserted}`);
    logger.info(`  Duration: ${result.duration_seconds}s`);
  } else {
    logger.error(`✗ ${slug.toUpperCase()} scraper failed`);
    logger.error(`  Error: ${result.error_message}`);
    if (result.error_screenshot_path) {
      logger.info(`  Screenshot: ${result.error_screenshot_path}`);
    }
  }
  logger.info(`========================================`);

  return result.success;
}

/**
 * Run scraper in test-ocr mode: capture 1 screenshot/page, send to Gemini, print raw output.
 * No DB insertion.
 */
async function runTestOcr(slug: SupermarketSlug, outputPath?: string) {
  logger.info(`========================================`);
  logger.info(`[TEST-OCR] ${slug.toUpperCase()} — single chunk OCR test`);
  logger.info(`========================================`);

  const scraper = getScraper(slug);
  const products = await scraper.runTestOcr();

  const json = JSON.stringify(products, (_, v) => v === undefined ? null : v, 2);

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, json, 'utf-8');
    logger.info(`[TEST-OCR] ${products.length} products written to ${outputPath}`);
  } else {
    logger.info(`\n[TEST-OCR] Raw extracted products (${products.length}):\n`);
    console.log(json);
  }

  logger.info(`========================================`);
  logger.info(`[TEST-OCR] Done. ${products.length} products extracted. No DB writes.`);
  logger.info(`========================================`);
}

/**
 * Run scraper in dry-run mode: full pipeline but skip DB insertion.
 * Prints all ScrapedProduct[] to console as JSON.
 */
async function runDryRun(slug: SupermarketSlug) {
  logger.info(`========================================`);
  logger.info(`[DRY-RUN] ${slug.toUpperCase()} — full scrape, no DB writes`);
  logger.info(`========================================`);

  const scraper = getScraper(slug);
  const products = await scraper.runDryRun();

  logger.info(`\n[DRY-RUN] Scraped products (${products.length}):\n`);
  console.log(JSON.stringify(products, (_, v) => v === undefined ? null : v, 2));

  logger.info(`========================================`);
  logger.info(`[DRY-RUN] Done. ${products.length} products scraped. No DB writes.`);
  logger.info(`========================================`);
}

/**
 * Run all scrapers
 */
async function runAllScrapers() {
  const supermarkets: SupermarketSlug[] = ['ah', 'jumbo', 'aldi', 'dirk', 'dekamarkt', 'vomar', 'hoogvliet', 'picnic', 'joybuy', 'megafoodstunter', 'butlon', 'action', 'kruidvat'];
  const results: boolean[] = [];

  for (const slug of supermarkets) {
    const success = await runScraper(slug);
    results.push(success);

    // Delay between scrapers to avoid overwhelming the system
    if (slug !== supermarkets[supermarkets.length - 1]) {
      logger.info('Waiting 10 seconds before next scraper...\n');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  const successCount = results.filter((r) => r).length;
  logger.info(`\n========================================`);
  logger.info(`All scrapers completed`);
  logger.info(`  Successful: ${successCount}/${supermarkets.length}`);
  logger.info(`========================================`);

  return results.every((r) => r);
}

/**
 * Show statistics for a supermarket
 */
async function showStats(slug: SupermarketSlug) {
  logger.info(`========================================`);
  logger.info(`${slug.toUpperCase()} Statistics`);
  logger.info(`========================================`);

  const stats = await getScraperStats(slug);
  const productCount = await getActiveProductCount(slug);

  logger.info(`Active products: ${productCount}`);
  logger.info(`Total scraper runs: ${stats.total_runs}`);
  logger.info(`Successful runs: ${stats.successful_runs}`);
  logger.info(`Failed runs: ${stats.failed_runs}`);
  logger.info(`Success rate: ${stats.success_rate}%`);
  logger.info(`Average duration: ${stats.avg_duration_seconds}s`);
  logger.info(`Total products scraped: ${stats.total_products_scraped}`);
  logger.info(`Last run: ${stats.last_run_at || 'Never'}`);

  logger.info(`========================================`);
}

/**
 * Cleanup expired products
 */
async function cleanup() {
  logger.info(`========================================`);
  logger.info(`Cleaning up expired products...`);
  logger.info(`========================================`);

  const count = await deactivateExpiredProducts();

  logger.success(`✓ Deactivated ${count} expired products`);
  logger.info(`========================================`);
}

/**
 * Parse command-line arguments
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command
  const command = args.find((arg) => !arg.startsWith('--'));
  const flags = args.filter((arg) => arg.startsWith('--'));

  // Extract flags
  const supermarketFlag = flags.find((f) => f.startsWith('--supermarket='));
  const supermarket = supermarketFlag?.split('=')[1] as SupermarketSlug | undefined;
  const isTestOcr = flags.includes('--test-ocr');
  const isDryRun = flags.includes('--dry-run');
  const outputFlag = flags.find((f) => f.startsWith('--output='));
  const outputPath = outputFlag?.split('=')[1];

  const validSupermarkets: SupermarketSlug[] = ['ah', 'jumbo', 'aldi', 'dirk', 'dekamarkt', 'vomar', 'hoogvliet', 'picnic', 'joybuy', 'megafoodstunter', 'butlon', 'action', 'flink', 'kruidvat'];

  // --test-ocr and --dry-run modes: no DB connection needed
  if ((isTestOcr || isDryRun) && supermarket) {
    if (!validSupermarkets.includes(supermarket)) {
      logger.error(`Invalid supermarket: ${supermarket}`);
      logger.info(`Valid options: ${validSupermarkets.join(', ')}`);
      process.exit(1);
    }

    if (isTestOcr) {
      await runTestOcr(supermarket, outputPath);
    } else {
      await runDryRun(supermarket);
    }
    return;
  }

  if ((isTestOcr || isDryRun) && !supermarket) {
    logger.error(`--test-ocr and --dry-run require --supermarket=<slug>`);
    process.exit(1);
  }

  // All other commands require Supabase connection
  const connected = await testConnection();
  if (!connected) {
    logger.error('Failed to connect to Supabase. Check your .env configuration.');
    process.exit(1);
  }

  // Commands
  if (command === 'stats' && supermarket) {
    await showStats(supermarket);
    return;
  }

  if (command === 'cleanup') {
    await cleanup();
    return;
  }

  if (command === 'all') {
    const success = await runAllScrapers();
    process.exit(success ? 0 : 1);
    return;
  }

  // Default: run scraper for specified supermarket
  if (supermarket) {
    if (!validSupermarkets.includes(supermarket)) {
      logger.error(`Invalid supermarket: ${supermarket}`);
      logger.info(`Valid options: ${validSupermarkets.join(', ')}`);
      process.exit(1);
    }

    const success = await runScraper(supermarket);
    process.exit(success ? 0 : 1);
    return;
  }

  // Show usage
  logger.info(`
SupermarktDeals Scraper CLI

Usage:
  npm run scrape -- --supermarket=<slug>   Run scraper for specific supermarket
  npm run scrape -- all                    Run all scrapers
  npm run scrape -- stats --supermarket=<slug>  Show statistics
  npm run scrape -- cleanup                Cleanup expired products

OCR Development Flags:
  npm run scrape -- --supermarket=<slug> --test-ocr   Capture 1 screenshot/page, OCR it, print raw output (no DB)
  npm run scrape -- --supermarket=<slug> --dry-run    Full scrape pipeline, print all products as JSON (no DB)

Supermarkets (Stores):
  ah               Albert Heijn
  jumbo            Jumbo
  aldi             Aldi
  dirk             Dirk
  vomar            Vomar
  dekamarkt        Dekamarkt
  hoogvliet        Hoogvliet

Stores (Non-food):
  action           Action (all product types)
  kruidvat         Kruidvat (all product types)

Supermarkets (Online):
  picnic           Picnic (requires account)
  flink            Flink (DataDome blocked - not in 'all')
  joybuy           Joybuy (uses Firefox)
  megafoodstunter  Megafoodstunter
  butlon           Butlon

Examples:
  npm run scrape -- --supermarket=ah
  npm run scrape -- --supermarket=megafoodstunter
  npm run scrape -- --supermarket=dirk --test-ocr
  npm run scrape -- --supermarket=dirk --dry-run
  npm run scrape -- all
  npm run scrape -- stats --supermarket=ah
  npm run scrape -- cleanup
  `);
}

// Run main function
main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
