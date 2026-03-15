/**
 * FavoritesScreen
 * Shows user's favorited products grouped by supermarket
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, SectionList } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFavoritesStore } from '../stores/favoritesStore';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '../components/EmptyState';
import { getSupermarketColor } from '../utils/formatters';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

interface Section {
  title: string;
  slug: string;
  data: ProductWithRelations[];
}

export const FavoritesScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { favorites, loadFavorites } = useFavoritesStore();

  useEffect(() => {
    loadFavorites();
  }, []);

  // Group favorites by supermarket
  const sections: Section[] = React.useMemo(() => {
    const grouped = favorites.reduce((acc, product) => {
      const supermarketName = product.supermarket?.name || 'Onbekend';
      const slug = product.supermarket?.slug || '';

      if (!acc[supermarketName]) {
        acc[supermarketName] = { slug, items: [] };
      }

      acc[supermarketName].items.push(product);

      return acc;
    }, {} as Record<string, { slug: string; items: ProductWithRelations[] }>);

    return Object.entries(grouped).map(([title, { slug, items }]) => ({
      title,
      slug,
      data: items,
    }));
  }, [favorites]);

  const handleProductPress = (productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  };

  const renderSectionHeader = ({ section }: { section: Section }) => {
    const brandColor = getSupermarketColor(section.slug);
    return (
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: brandColor }]} />
        <View style={styles.sectionContent}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCount}>
            {section.data.length} {section.data.length === 1 ? 'product' : 'producten'}
          </Text>
        </View>
      </View>
    );
  };

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
      actionLabel="Naar deals"
      onAction={() => navigation.navigate('Home' as any)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Favorieten</Text>
        {favorites.length > 0 && (
          <Text style={styles.headerCount}>{favorites.length} opgeslagen</Text>
        )}
      </View>

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
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#212529',
    letterSpacing: -0.5,
  },
  headerCount: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  sectionAccent: {
    width: 4,
  },
  sectionContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#212529',
  },
  sectionCount: {
    color: '#9E9E9E',
    marginTop: 2,
    fontSize: 12,
  },
  cardContainer: {
    paddingHorizontal: 4,
    marginBottom: 2,
  },
});
