/**
 * FavoritesScreen
 * Shows user's favorited products grouped by supermarket
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, SectionList } from 'react-native';
import { Appbar, Text, Divider } from 'react-native-paper';
import { useFavoritesStore } from '../stores/favoritesStore';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '../components/EmptyState';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

interface Section {
  title: string;
  data: ProductWithRelations[];
}

export const FavoritesScreen: React.FC<Props> = ({ navigation }) => {
  const { favorites, loadFavorites } = useFavoritesStore();

  useEffect(() => {
    loadFavorites();
  }, []);

  // Group favorites by supermarket
  const sections: Section[] = React.useMemo(() => {
    const grouped = favorites.reduce((acc, product) => {
      const supermarketName = product.supermarket?.name || 'Onbekend';

      if (!acc[supermarketName]) {
        acc[supermarketName] = [];
      }

      acc[supermarketName].push(product);

      return acc;
    }, {} as Record<string, ProductWithRelations[]>);

    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data,
    }));
  }, [favorites]);

  const handleProductPress = (productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  };

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        {section.title}
      </Text>
      <Text variant="bodySmall" style={styles.sectionCount}>
        {section.data.length} {section.data.length === 1 ? 'product' : 'producten'}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: ProductWithRelations }) => (
    <View style={styles.cardContainer}>
      <ProductCard product={item} onPress={() => handleProductPress(item.id)} />
    </View>
  );

  const renderEmpty = () => (
    <EmptyState
      icon="heart-outline"
      title="Geen favorieten"
      message="Tik op het hartje bij een product om het toe te voegen aan je favorieten"
      actionLabel="Naar aanbiedingen"
      onAction={() => navigation.navigate('Home')}
    />
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Favorieten" />
      </Appbar.Header>

      {favorites.length === 0 ? (
        renderEmpty()
      ) : (
        <SectionList
          sections={sections}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          SectionSeparatorComponent={() => <Divider style={styles.divider} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 8,
  },
  sectionHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  sectionCount: {
    color: '#666',
    marginTop: 4,
  },
  cardContainer: {
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
});
