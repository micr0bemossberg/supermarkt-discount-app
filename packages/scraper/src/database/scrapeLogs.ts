/**
 * Scrape Logs Database Layer
 * Functions for logging scraper execution and monitoring
 */

import { supabase } from '../config/supabase';
import { createLogger } from '../utils/logger';
import { getSupermarketId } from './products';
import type { ScrapeLog, ScrapeResult, SupermarketSlug } from '@supermarkt-deals/shared';

const logger = createLogger('ScrapeLogsDB');

/**
 * Create a scrape log entry
 */
export async function createScrapeLog(
  result: ScrapeResult
): Promise<ScrapeLog | null> {
  try {
    const supermarketId = await getSupermarketId(result.supermarket_slug as SupermarketSlug);

    const logData = {
      supermarket_id: supermarketId,
      status: result.status ?? (result.success ? 'success' : 'failed'),
      products_scraped: result.products_scraped,
      error_message: result.error_message || (result.metadata ? JSON.stringify(result.metadata) : null),
      duration_seconds: result.duration_seconds,
    };

    const { data, error } = await supabase
      .from('scrape_logs')
      .insert(logData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create scrape log', error);
      return null;
    }

    return data as ScrapeLog;
  } catch (error) {
    logger.error('Error creating scrape log', error);
    return null;
  }
}

/**
 * Get recent scrape logs for a supermarket
 */
export async function getRecentLogs(
  supermarketSlug: SupermarketSlug,
  limit: number = 10
): Promise<ScrapeLog[]> {
  try {
    const supermarketId = await getSupermarketId(supermarketSlug);
    if (!supermarketId) return [];

    const { data, error } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('supermarket_id', supermarketId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to get scrape logs', error);
      return [];
    }

    return (data || []) as ScrapeLog[];
  } catch (error) {
    logger.error('Error getting scrape logs', error);
    return [];
  }
}

/**
 * Get scraper statistics for monitoring
 */
export async function getScraperStats(supermarketSlug: SupermarketSlug): Promise<{
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_duration_seconds: number;
  total_products_scraped: number;
  last_run_at: string | null;
}> {
  try {
    const supermarketId = await getSupermarketId(supermarketSlug);
    if (!supermarketId) {
      return {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        success_rate: 0,
        avg_duration_seconds: 0,
        total_products_scraped: 0,
        last_run_at: null,
      };
    }

    const { data, error } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('supermarket_id', supermarketId);

    if (error || !data) {
      logger.error('Failed to get scraper stats', error);
      return {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        success_rate: 0,
        avg_duration_seconds: 0,
        total_products_scraped: 0,
        last_run_at: null,
      };
    }

    const logs = data as ScrapeLog[];
    const totalRuns = logs.length;
    const successfulRuns = logs.filter((log) => log.status === 'success').length;
    const failedRuns = logs.filter((log) => log.status === 'failed').length;
    const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

    const totalDuration = logs.reduce(
      (sum, log) => sum + (log.duration_seconds || 0),
      0
    );
    const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

    const totalProducts = logs.reduce(
      (sum, log) => sum + log.products_scraped,
      0
    );

    const lastRun = logs.length > 0 ? logs[0].created_at : null;

    return {
      total_runs: totalRuns,
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      success_rate: Math.round(successRate),
      avg_duration_seconds: Math.round(avgDuration),
      total_products_scraped: totalProducts,
      last_run_at: lastRun,
    };
  } catch (error) {
    logger.error('Error getting scraper stats', error);
    return {
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      success_rate: 0,
      avg_duration_seconds: 0,
      total_products_scraped: 0,
      last_run_at: null,
    };
  }
}
