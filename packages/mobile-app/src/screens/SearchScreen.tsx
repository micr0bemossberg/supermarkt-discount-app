/**
 * SearchScreen
 * Product search with search history
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Searchbar, List, Text, Divider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchProducts } from '../services/products';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '../components/EmptyState';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

const SEARCH_HISTORY_KEY = '@search_history';
const MAX_HISTORY_ITEMS = 10;

export const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithRelations[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    loadSearchHistory();
  }, []);

  const loadSearchHistory = async () => {
    try {
      const json = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      const history = json ? JSON.parse(json) : [];
      setSearchHistory(history);
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  };

  const saveToHistory = async (query: string) => {
    if (!query.trim()) return;

    try {
      // Remove if already exists
      const newHistory = [
        query,
        ...searchHistory.filter((item) => item !== query),
      ].slice(0, MAX_HISTORY_ITEMS);

      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
      setSearchHistory(newHistory);
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
      setSearchHistory([]);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const results = await searchProducts(query, 50);
      setSearchResults(results);
      saveToHistory(query);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchHistory]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleSearch(searchQuery);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleHistoryItemPress = (query: string) => {
    setSearchQuery(query);
    handleSearch(query);
  };

  const renderSearchResults = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <Text>Zoeken...</Text>
        </View>
      );
    }

    if (searched && searchResults.length === 0) {
      return (
        <EmptyState
          icon="magnify"
          title="Geen resultaten"
          message={`Geen producten gevonden voor "${searchQuery}"`}
        />
      );
    }

    return (
      <FlatList
        data={searchResults}
        renderItem={({ item }) => (
          <View style={styles.cardContainer}>
            <ProductCard
              product={item}
              onPress={() =>
                navigation.navigate('ProductDetail', { productId: item.id })
              }
            />
          </View>
        )}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.resultsContainer}
      />
    );
  };

  const renderSearchHistory = () => {
    if (searchHistory.length === 0) {
      return (
        <EmptyState
          icon="history"
          title="Geen zoekgeschiedenis"
          message="Je recente zoekopdrachten verschijnen hier"
        />
      );
    }

    return (
      <View>
        <View style={styles.historyHeader}>
          <Text variant="titleSmall" style={styles.historyTitle}>
            Recente zoekopdrachten
          </Text>
          <Text
            variant="bodySmall"
            style={styles.clearHistory}
            onPress={clearHistory}
          >
            Wissen
          </Text>
        </View>
        {searchHistory.map((item, index) => (
          <React.Fragment key={index}>
            <List.Item
              title={item}
              left={(props) => <List.Icon {...props} icon="history" />}
              right={(props) => <List.Icon {...props} icon="arrow-top-left" />}
              onPress={() => handleHistoryItemPress(item)}
            />
            {index < searchHistory.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Zoek producten..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        autoFocus
      />

      {!searchQuery && renderSearchHistory()}
      {searchQuery && renderSearchResults()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchBar: {
    margin: 16,
    elevation: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsContainer: {
    padding: 8,
  },
  cardContainer: {
    flex: 1 / 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  historyTitle: {
    fontWeight: '600',
  },
  clearHistory: {
    color: '#0066CC',
  },
});
