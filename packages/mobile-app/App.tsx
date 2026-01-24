/**
 * App Entry Point
 * SupermarktDeals - Dutch Supermarket Discount Aggregator
 */

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/stores/settingsStore';
import { useFavoritesStore } from './src/stores/favoritesStore';
import { lightTheme, darkTheme } from './src/theme/theme';

export default function App() {
  const systemColorScheme = useColorScheme();
  const { settings, loadSettings } = useSettingsStore();
  const { loadFavorites } = useFavoritesStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Load settings and favorites from AsyncStorage
        await Promise.all([loadSettings(), loadFavorites()]);
      } catch (error) {
        console.error('Failed to load app data:', error);
      } finally {
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  // Determine effective theme
  const getEffectiveTheme = () => {
    if (settings.themeMode === 'auto') {
      return systemColorScheme === 'dark' ? darkTheme : lightTheme;
    }
    return settings.themeMode === 'dark' ? darkTheme : lightTheme;
  };

  const theme = getEffectiveTheme();

  if (!isReady) {
    // You can show a splash screen here
    return null;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AppNavigator />
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
