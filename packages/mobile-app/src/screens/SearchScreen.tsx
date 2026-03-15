/**
 * SearchScreen
 * Product search with search history
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Searchbar, Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
          <Text style={styles.loadingText}>Zoeken...</Text>
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
          <Text style={styles.historyTitle}>Recente zoekopdrachten</Text>
          <Pressable onPress={clearHistory}>
            <Text style={styles.clearHistory}>Wissen</Text>
          </Pressable>
        </View>
        {searchHistory.map((item, index) => (
          <Pressable
            key={index}
            onPress={() => handleHistoryItemPress(item)}
            style={styles.historyItem}
          >
            <MaterialCommunityIcons name="history" size={20} color="#9E9E9E" />
            <Text style={styles.historyItemText}>{item}</Text>
            <MaterialCommunityIcons name="arrow-top-left" size={18} color="#BDBDBD" />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchHeader, { paddingTop: insets.top }]}>
        <IconButton
          icon="arrow-left"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />
        <Searchbar
          placeholder="Zoek producten..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          autoFocus
          elevation={0}
        />
      </View>

      {!searchQuery && renderSearchHistory()}
      {searchQuery && renderSearchResults()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  backButton: {
    margin: 0,
  },
  searchBar: {
    flex: 1,
    backgroundColor: '#F1F3F5',
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 44,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#757575',
  },
  resultsContainer: {
    padding: 4,
  },
  cardContainer: {
    flex: 1 / 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  historyTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#424242',
  },
  clearHistory: {
    color: '#1B5E20',
    fontWeight: '600',
    fontSize: 13,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  historyItemText: {
    flex: 1,
    fontSize: 15,
    color: '#424242',
  },
});
