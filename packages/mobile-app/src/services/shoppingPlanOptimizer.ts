/**
 * Shopping Plan Optimizer
 * Groups matched grocery items by cheapest supermarket and calculates totals
 */

import type { ProductWithRelations, Supermarket } from '@supermarkt-deals/shared';
import type { GroceryItem } from '../stores/groceryListStore';
import type { MatchedGroceryItem } from './groceryMatcher';

export interface StoreVisitItem {
  groceryItem: GroceryItem;
  deal: ProductWithRelations;
}

export interface StoreVisit {
  supermarket: Supermarket;
  items: StoreVisitItem[];
  storeCost: number;
  storeSavings: number;
}

export interface ShoppingPlan {
  storeVisits: StoreVisit[];
  onlineStoreVisits: StoreVisit[];  // Online-only stores (Picnic, etc.)
  unmatchedItems: GroceryItem[];
  totalCost: number;
  totalSavings: number;
  totalItems: number;
  matchedItems: number;
}

/**
 * Generate an optimized shopping plan from matched grocery items.
 * Picks the cheapest deal per item, groups by supermarket.
 */
export function generateShoppingPlan(
  matchedItems: MatchedGroceryItem[]
): ShoppingPlan {
  const storeMap = new Map<string, StoreVisit>();
  const unmatchedItems: GroceryItem[] = [];
  let totalCost = 0;
  let totalSavings = 0;
  let matchedCount = 0;

  for (const matched of matchedItems) {
    if (!matched.bestDeal) {
      unmatchedItems.push(matched.groceryItem);
      continue;
    }

    const deal = matched.bestDeal.product;
    const supermarket = deal.supermarket;
    if (!supermarket) {
      unmatchedItems.push(matched.groceryItem);
      continue;
    }

    matchedCount++;
    const itemCost = deal.discount_price * matched.groceryItem.quantity;
    totalCost += itemCost;

    // Calculate savings from original price
    if (deal.original_price && deal.original_price > deal.discount_price) {
      totalSavings += (deal.original_price - deal.discount_price) * matched.groceryItem.quantity;
    }

    // Group by supermarket
    const storeKey = supermarket.id;
    if (!storeMap.has(storeKey)) {
      storeMap.set(storeKey, {
        supermarket,
        items: [],
        storeCost: 0,
        storeSavings: 0,
      });
    }

    const visit = storeMap.get(storeKey)!;
    visit.items.push({ groceryItem: matched.groceryItem, deal });
    visit.storeCost += itemCost;
    if (deal.original_price && deal.original_price > deal.discount_price) {
      visit.storeSavings += (deal.original_price - deal.discount_price) * matched.groceryItem.quantity;
    }
  }

  // Split into physical and online stores
  const allVisits = Array.from(storeMap.values());

  // Sort by number of items descending (visit stores with most items first)
  allVisits.sort((a, b) => b.items.length - a.items.length);

  const physicalVisits = allVisits.filter((v) => !v.supermarket.is_online_only);
  const onlineVisits = allVisits.filter((v) => v.supermarket.is_online_only);

  return {
    storeVisits: physicalVisits,
    onlineStoreVisits: onlineVisits,
    unmatchedItems,
    totalCost,
    totalSavings,
    totalItems: matchedItems.length,
    matchedItems: matchedCount,
  };
}
