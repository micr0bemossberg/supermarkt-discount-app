/**
 * Products Store
 * Zustand store for managing product state
 */

import { create } from 'zustand';
import { getProducts } from '../services/products';
import type { ProductWithRelations, ProductFilters } from '@supermarkt-deals/shared';

interface ProductsState {
  // State
  products: ProductWithRelations[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  dbOffset: number; // tracks actual DB rows consumed (not filtered count)

  // Current filters
  filters: ProductFilters;

  // Actions
  fetchProducts: (newFilters?: ProductFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: Partial<ProductFilters>) => void;
  clearFilters: () => void;
  reset: () => void;
}

const defaultFilters: ProductFilters = {
  supermarket_ids: [],
  category_id: null,
  search: undefined,
  limit: 20,
  offset: 0,
};

export const useProductsStore = create<ProductsState>((set, get) => ({
  // Initial state
  products: [],
  loading: false,
  refreshing: false,
  error: null,
  hasMore: true,
  dbOffset: 0,
  filters: defaultFilters,

  // Fetch products with filters
  fetchProducts: async (newFilters?: ProductFilters) => {
    const currentFilters = get().filters;
    const mergedFilters = { ...currentFilters, ...newFilters, offset: 0 };

    set({ loading: true, error: null, filters: mergedFilters, dbOffset: 0 });

    try {
      const { products, rawCount } = await getProducts(mergedFilters);

      set({
        products,
        loading: false,
        hasMore: rawCount >= (mergedFilters.limit || 20),
        dbOffset: rawCount, // track actual DB rows consumed
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch products',
        loading: false,
      });
    }
  },

  // Load more products (pagination)
  loadMore: async () => {
    const { loading, hasMore, products, filters, dbOffset } = get();

    if (loading || !hasMore) {
      return;
    }

    // Use actual DB offset (raw rows consumed) instead of filtered products count
    const newFilters = { ...filters, offset: dbOffset };

    set({ loading: true });

    try {
      const { products: newProducts, rawCount } = await getProducts(newFilters);

      set({
        products: [...products, ...newProducts],
        loading: false,
        hasMore: rawCount >= (filters.limit || 20),
        dbOffset: dbOffset + rawCount, // advance by raw rows consumed
        filters: newFilters,
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to load more products',
        loading: false,
      });
    }
  },

  // Refresh products (pull-to-refresh)
  refresh: async () => {
    const { filters } = get();

    set({ refreshing: true, error: null });

    try {
      const { products, rawCount } = await getProducts({ ...filters, offset: 0 });

      set({
        products,
        refreshing: false,
        hasMore: rawCount >= (filters.limit || 20),
        dbOffset: rawCount,
        filters: { ...filters, offset: 0 },
      });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to refresh products',
        refreshing: false,
      });
    }
  },

  // Update filters
  setFilters: (newFilters: Partial<ProductFilters>) => {
    const currentFilters = get().filters;
    const mergedFilters = { ...currentFilters, ...newFilters };
    set({ filters: mergedFilters });

    // Automatically fetch with new filters
    get().fetchProducts(mergedFilters);
  },

  // Clear all filters
  clearFilters: () => {
    set({ filters: defaultFilters });
    get().fetchProducts(defaultFilters);
  },

  // Reset store to initial state
  reset: () => {
    set({
      products: [],
      loading: false,
      refreshing: false,
      error: null,
      hasMore: true,
      dbOffset: 0,
      filters: defaultFilters,
    });
  },
}));
