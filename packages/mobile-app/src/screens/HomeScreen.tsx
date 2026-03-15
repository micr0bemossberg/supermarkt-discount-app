/**
 * HomeScreen
 * Clean, modern home with product grid, inline search, and compact filters
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { Text, Searchbar, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProductsStore } from '../stores/productsStore';
import { ProductCard } from '../components/ProductCard';
import { SupermarketFilter } from '../components/SupermarketFilter';
import { CategoryChips } from '../components/CategoryChips';
import { EmptyState } from '../components/EmptyState';
import { ProductGridSkeleton } from '../components/LoadingSkeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    products,
    loading,
    refreshing,
    error,
    hasMore,
    filters,
    fetchProducts,
    loadMore,
    refresh,
    setFilters,
  } = useProductsStore();

  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSupermarketFilterChange = (supermarketIds: string[]) => {
    setFilters({ supermarket_ids: supermarketIds });
  };

  const handleCategoryChange = (categoryId: string | null) => {
    setFilters({ category_id: categoryId });
  };

  const handleProductPress = (productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters({ search: text || undefined });
    }, 400);
  };

  const handleEndReached = () => {
    if (!loading && hasMore) {
      loadMore();
    }
  };

  const toggleCardFilter = () => {
    if (filters.requires_card === undefined) {
      setFilters({ requires_card: true });
    } else if (filters.requires_card === true) {
      setFilters({ requires_card: false });
    } else {
      setFilters({ requires_card: undefined });
    }
  };

  const renderItem = useCallback(
    ({ item }: any) => (
      <View style={styles.cardContainer}>
        <ProductCard
          product={item}
          onPress={() => handleProductPress(item.id)}
        />
      </View>
    ),
    []
  );

  const renderHeader = () => (
    <View style={[styles.headerSection, { paddingTop: insets.top }]}>
      {/* App Title Bar */}
      <View style={styles.titleBar}>
        <View>
          <Text style={styles.appTitle}>SupermarktDeals</Text>
          <Text style={styles.appSubtitle}>
            {products.length > 0
              ? `${products.length} aanbiedingen gevonden`
              : 'Bekijk de beste deals'}
          </Text>
        </View>
        <IconButton
          icon={showFilters ? 'filter-variant-minus' : 'filter-variant'}
          size={22}
          onPress={() => setShowFilters(!showFilters)}
          style={styles.filterToggle}
        />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Zoek aanbiedingen..."
          value={searchText}
          onChangeText={handleSearchChange}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#757575"
          elevation={0}
        />
      </View>

      {/* Filters - collapsible */}
      {showFilters && (
        <View style={styles.filtersSection}>
          <SupermarketFilter
            selectedIds={filters.supermarket_ids || []}
            onSelectionChange={handleSupermarketFilterChange}
          />
          <CategoryChips
            selectedId={filters.category_id || null}
            onSelectionChange={handleCategoryChange}
          />

          {/* Quick filter chips row */}
          <View style={styles.quickFilters}>
            <Pressable
              onPress={toggleCardFilter}
              style={[
                styles.quickChip,
                filters.requires_card !== undefined && styles.quickChipActive,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  filters.requires_card === true
                    ? 'card-account-details'
                    : filters.requires_card === false
                      ? 'card-off-outline'
                      : 'card-account-details-outline'
                }
                size={14}
                color={filters.requires_card !== undefined ? '#fff' : '#616161'}
              />
              <Text
                style={[
                  styles.quickChipText,
                  filters.requires_card !== undefined && styles.quickChipTextActive,
                ]}
              >
                {filters.requires_card === true
                  ? 'Alleen pas-deals'
                  : filters.requires_card === false
                    ? 'Zonder pas'
                    : 'Pas filter'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading && products.length === 0) {
      return <ProductGridSkeleton count={6} />;
    }

    if (error) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title="Fout bij laden"
          message={error}
          actionLabel="Opnieuw proberen"
          onAction={() => fetchProducts()}
        />
      );
    }

    return (
      <EmptyState
        icon="package-variant-closed"
        title="Geen aanbiedingen gevonden"
        message="Probeer een ander filter of zoekterm"
      />
    );
  };

  const renderFooter = () => {
    if (loading && products.length > 0) {
      return (
        <View style={styles.footer}>
          <ProductGridSkeleton count={2} />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={['#1B5E20']}
            tintColor="#1B5E20"
          />
        }
        contentContainerStyle={[
          styles.gridContent,
          products.length === 0 && styles.emptyContent,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    marginBottom: 4,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1B5E20',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  filterToggle: {
    margin: 0,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchbar: {
    backgroundColor: '#F1F3F5',
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 44,
  },
  filtersSection: {
    paddingBottom: 4,
  },
  quickFilters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F3F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  quickChipActive: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
  },
  quickChipTextActive: {
    color: '#FFFFFF',
  },
  gridContent: {
    paddingHorizontal: 4,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  cardContainer: {
    flex: 1 / 2,
  },
  emptyContent: {
    flex: 1,
  },
  footer: {
    paddingVertical: 16,
  },
});
