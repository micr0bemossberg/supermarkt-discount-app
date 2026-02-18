/**
 * HomeScreen
 * Main screen showing product grid with filters
 */

import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Appbar, FAB } from 'react-native-paper';
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

  useEffect(() => {
    // Initial load
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

  const handleSearchPress = () => {
    navigation.navigate('Search');
  };

  const handleEndReached = () => {
    if (!loading && hasMore) {
      loadMore();
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
    <>
      <SupermarketFilter
        selectedIds={filters.supermarket_ids || []}
        onSelectionChange={handleSupermarketFilterChange}
      />
      <CategoryChips
        selectedId={filters.category_id || null}
        onSelectionChange={handleCategoryChange}
      />
    </>
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
        message="Probeer een ander filter te selecteren"
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
      <Appbar.Header>
        <Appbar.Content title="SupermarktDeals" />
        <Appbar.Action icon="magnify" onPress={handleSearchPress} />
      </Appbar.Header>

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
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        contentContainerStyle={[
          styles.gridContent,
          products.length === 0 && styles.emptyContent,
        ]}
      />

      <FAB
        icon="filter-variant"
        style={styles.fab}
        onPress={() => {
          // TODO: Open filter modal
        }}
        label="Filters"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
