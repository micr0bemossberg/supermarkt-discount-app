/**
 * Settings Store
 * Zustand store for app settings and preferences
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_STORAGE_KEY = '@supermarkt_deals_settings';

type ThemeMode = 'light' | 'dark' | 'auto';

interface Settings {
  themeMode: ThemeMode;
  preferredSupermarkets: string[]; // Supermarket IDs
}

interface SettingsState {
  // State
  settings: Settings;
  loading: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setPreferredSupermarkets: (supermarketIds: string[]) => Promise<void>;
  getEffectiveTheme: () => 'light' | 'dark';
}

const defaultSettings: Settings = {
  themeMode: 'auto',
  preferredSupermarkets: [],
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Initial state
  settings: defaultSettings,
  loading: false,

  // Load settings from AsyncStorage
  loadSettings: async () => {
    set({ loading: true });

    try {
      const json = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      const settings = json ? JSON.parse(json) : defaultSettings;

      set({ settings, loading: false });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ settings: defaultSettings, loading: false });
    }
  },

  // Set theme mode
  setThemeMode: async (mode: ThemeMode) => {
    try {
      const newSettings = { ...get().settings, themeMode: mode };

      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(newSettings)
      );

      set({ settings: newSettings });
    } catch (error) {
      console.error('Failed to set theme mode:', error);
    }
  },

  // Set preferred supermarkets
  setPreferredSupermarkets: async (supermarketIds: string[]) => {
    try {
      const newSettings = { ...get().settings, preferredSupermarkets: supermarketIds };

      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(newSettings)
      );

      set({ settings: newSettings });
    } catch (error) {
      console.error('Failed to set preferred supermarkets:', error);
    }
  },

  // Get effective theme based on mode (system preference handled in component)
  getEffectiveTheme: () => {
    const { themeMode } = get().settings;
    // Return 'light' as default when 'auto' - component should use useColorScheme
    return themeMode === 'auto' ? 'light' : themeMode;
  },
}));
