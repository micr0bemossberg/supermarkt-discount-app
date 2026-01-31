/**
 * ProductCard Component
 * Displays a product with image, title, prices, and discount info
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Card, Text, IconButton, Surface } from 'react-native-paper';
import { Image } from 'expo-image';
import { useFavoritesStore } from '../stores/favoritesStore';
import { formatPrice, getValidityText } from '../utils/formatters';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

interface ProductCardProps {
  product: ProductWithRelations;
  onPress: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onPress }) => {
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const favorite = isFavorite(product.id);

  const handleFavoriteToggle = () => {
    if (favorite) {
      removeFavorite(product.id);
    } else {
      addFavorite(product);
    }
  };

  const discountPercentage =
    product.discount_percentage ||
    (product.original_price
      ? Math.round(
          ((product.original_price - product.discount_price) /
            product.original_price) *
            100
        )
      : null);

  const validityText = getValidityText(product.valid_until);

  return (
    <Card style={styles.card} mode="elevated">
      <Pressable onPress={onPress}>
        <View style={styles.imageContainer}>
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text variant="bodySmall" style={styles.placeholderText}>
                Geen afbeelding
              </Text>
            </View>
          )}

          {/* Discount Badge */}
          {discountPercentage && discountPercentage > 0 && (
            <Surface style={styles.discountBadge} elevation={2}>
              <Text variant="labelSmall" style={styles.discountText}>
                -{discountPercentage}%
              </Text>
            </Surface>
          )}

          {/* Favorite Button */}
          <Surface style={styles.favoriteButton} elevation={2}>
            <IconButton
              icon={favorite ? 'heart' : 'heart-outline'}
              iconColor={favorite ? '#E74C3C' : '#666'}
              size={20}
              onPress={handleFavoriteToggle}
              style={styles.favoriteIconButton}
            />
          </Surface>

          {/* Supermarket Badge */}
          {product.supermarket && (
            <Surface style={styles.supermarketBadge} elevation={1}>
              <Text variant="labelSmall" style={styles.supermarketText}>
                {product.supermarket.name}
              </Text>
            </Surface>
          )}
        </View>

        <Card.Content style={styles.content}>
          {/* Product Title */}
          <Text variant="bodyMedium" numberOfLines={2} style={styles.title}>
            {product.title}
          </Text>

          {/* Unit Info */}
          {product.unit_info && (
            <Text variant="bodySmall" style={styles.unitInfo}>
              {product.unit_info}
            </Text>
          )}

          {/* Prices */}
          <View style={styles.priceRow}>
            {product.original_price && (
              <Text variant="bodySmall" style={styles.originalPrice}>
                {formatPrice(product.original_price)}
              </Text>
            )}
            <Text variant="titleMedium" style={styles.discountPrice}>
              {formatPrice(product.discount_price)}
            </Text>
          </View>

          {/* Validity */}
          <Text variant="bodySmall" style={styles.validUntil}>
            {validityText}
          </Text>
        </Card.Content>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 8,
    marginVertical: 6,
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 160,
    backgroundColor: '#f5f5f5',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  placeholderText: {
    color: '#999',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#E74C3C',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discountText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  favoriteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  favoriteIconButton: {
    margin: 0,
  },
  supermarketBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  supermarketText: {
    fontWeight: '600',
  },
  content: {
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 120,
  },
  title: {
    marginBottom: 4,
    lineHeight: 20,
  },
  unitInfo: {
    color: '#666',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  discountPrice: {
    color: '#E74C3C',
    fontWeight: 'bold',
  },
  validUntil: {
    color: '#666',
    marginTop: 4,
  },
});
