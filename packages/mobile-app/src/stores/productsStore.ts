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
  filters: defaultFilters,

  // Fetch products with filters
  fetchProducts: async (newFilters?: ProductFilters) => {
    const currentFilters = get().filters;
    const mergedFilters = { ...currentFilters, ...newFilters, offset: 0 };

    set({ loading: true, error: null, filters: mergedFilters });

    try {
      const products = await getProducts(mergedFilters);

      set({
        products,
        loading: false,
        hasMore: products.length === (mergedFilters.limit || 20),
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
    const { loading, hasMore, products, filters } = get();

    if (loading || !hasMore) {
      return;
    }

    const newOffset = products.length;
    const newFilters = { ...filters, offset: newOffset };

    set({ loading: true });

    try {
      const newProducts = await getProducts(newFilters);

      set({
        products: [...products, ...newProducts],
        loading: false,
        hasMore: newProducts.length === (filters.limit || 20),
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
      const products = await getProducts({ ...filters, offset: 0 });

      set({
        products,
        refreshing: false,
        hasMore: products.length === (filters.limit || 20),
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
      filters: defaultFilters,
    });
  },
}));
