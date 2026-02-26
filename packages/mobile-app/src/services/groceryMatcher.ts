/**
 * Grocery Matcher Service
 * Matches grocery list items to current deals from Supabase
 */

import { supabase } from '../config/supabase';
import type { ProductWithRelations } from '@supermarkt-deals/shared';
import type { GroceryItem } from '../stores/groceryListStore';

export interface DealMatch {
  product: ProductWithRelations;
  relevanceScore: number;
}

export interface MatchedGroceryItem {
  groceryItem: GroceryItem;
  matches: DealMatch[];
  bestDeal: DealMatch | null;
}

/**
 * Calculate relevance score for a product matching a grocery item.
 * Higher score = better match.
 */
function scoreMatch(product: ProductWithRelations, groceryItem: GroceryItem): number {
  const title = product.title.toLowerCase();
  const itemName = groceryItem.name.toLowerCase();
  let score = 0;

  // Exact item name in title: high score
  if (title.includes(itemName)) {
    score += 100;
  }

  // Count how many keywords match
  for (const keyword of groceryItem.keywords) {
    if (title.includes(keyword.toLowerCase())) {
      score += 10;
    }
  }

  // Bonus for having a discount percentage
  if (product.discount_percentage && product.discount_percentage > 0) {
    score += product.discount_percentage * 0.5;
  }

  // Bonus for having an original price (means it's clearly discounted)
  if (product.original_price && product.original_price > product.discount_price) {
    score += 20;
  }

  return score;
}

/**
 * Search for deals matching a single grocery item.
 * Searches using the item's keywords against active products.
 */
async function findDealsForItem(groceryItem: GroceryItem): Promise<DealMatch[]> {
  const allMatches: Map<string, DealMatch> = new Map();

  // Search with the primary name first, then additional keywords
  const searchTerms = [groceryItem.name, ...groceryItem.keywords.filter((k) => k !== groceryItem.name.toLowerCase())];
  // Deduplicate and limit to top 5 keywords to avoid too many queries
  const uniqueTerms = [...new Set(searchTerms.map((t) => t.toLowerCase()))].slice(0, 5);

  for (const term of uniqueTerms) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          supermarket:supermarkets(*),
          category:categories(*)
        `)
        .eq('is_active', true)
        .gte('valid_until', new Date().toISOString().split('T')[0])
        .ilike('title', `%${term}%`)
        .limit(20);

      if (error || !data) continue;

      for (const product of data as ProductWithRelations[]) {
        if (allMatches.has(product.id)) continue;
        const score = scoreMatch(product, groceryItem);
        if (score > 0) {
          allMatches.set(product.id, { product, relevanceScore: score });
        }
      }
    } catch {
      // Continue with other keywords if one fails
    }
  }

  // Sort by price ascending (cheapest first), then by relevance descending
  return Array.from(allMatches.values()).sort((a, b) => {
    const priceDiff = a.product.discount_price - b.product.discount_price;
    if (Math.abs(priceDiff) > 0.01) return priceDiff;
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Match all grocery items to current deals.
 * Returns matched items with their best deals.
 */
export async function matchGroceryListToDeals(
  items: GroceryItem[]
): Promise<MatchedGroceryItem[]> {
  const results: MatchedGroceryItem[] = [];

  // Process items in batches of 3 to avoid overwhelming Supabase
  for (let i = 0; i < items.length; i += 3) {
    const batch = items.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (groceryItem) => {
        const matches = await findDealsForItem(groceryItem);
        return {
          groceryItem,
          matches,
          bestDeal: matches.length > 0 ? matches[0] : null,
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}
