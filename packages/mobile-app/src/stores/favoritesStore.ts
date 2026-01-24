/**
 * Favorites Store
 * Zustand store for managing user favorites (local storage only)
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

const FAVORITES_STORAGE_KEY = '@supermarkt_deals_favorites';

interface FavoritesState {
  // State
  favorites: ProductWithRelations[];
  loading: boolean;
  error: string | null;

  // Actions
  loadFavorites: () => Promise<void>;
  addFavorite: (product: ProductWithRelations) => Promise<void>;
  removeFavorite: (productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
  clearFavorites: () => Promise<void>;
  getFavoriteCount: () => number;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  // Initial state
  favorites: [],
  loading: false,
  error: null,

  // Load favorites from AsyncStorage
  loadFavorites: async () => {
    set({ loading: true, error: null });

    try {
      const json = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      const favorites = json ? JSON.parse(json) : [];

      set({ favorites, loading: false });
    } catch (error: any) {
      console.error('Failed to load favorites:', error);
      set({
        error: error.message || 'Failed to load favorites',
        loading: false,
      });
    }
  },

  // Add product to favorites
  addFavorite: async (product: ProductWithRelations) => {
    try {
      const currentFavorites = get().favorites;

      // Check if already favorited
      if (currentFavorites.some((fav) => fav.id === product.id)) {
        return;
      }

      const newFavorites = [...currentFavorites, product];

      // Save to AsyncStorage
      await AsyncStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(newFavorites)
      );

      set({ favorites: newFavorites });
    } catch (error: any) {
      console.error('Failed to add favorite:', error);
      set({ error: error.message || 'Failed to add favorite' });
    }
  },

  // Remove product from favorites
  removeFavorite: async (productId: string) => {
    try {
      const currentFavorites = get().favorites;
      const newFavorites = currentFavorites.filter(
        (fav) => fav.id !== productId
      );

      // Save to AsyncStorage
      await AsyncStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(newFavorites)
      );

      set({ favorites: newFavorites });
    } catch (error: any) {
      console.error('Failed to remove favorite:', error);
      set({ error: error.message || 'Failed to remove favorite' });
    }
  },

  // Check if product is favorited
  isFavorite: (productId: string) => {
    return get().favorites.some((fav) => fav.id === productId);
  },

  // Clear all favorites
  clearFavorites: async () => {
    try {
      await AsyncStorage.removeItem(FAVORITES_STORAGE_KEY);
      set({ favorites: [] });
    } catch (error: any) {
      console.error('Failed to clear favorites:', error);
      set({ error: error.message || 'Failed to clear favorites' });
    }
  },

  // Get count of favorites
  getFavoriteCount: () => {
    return get().favorites.length;
  },
}));
