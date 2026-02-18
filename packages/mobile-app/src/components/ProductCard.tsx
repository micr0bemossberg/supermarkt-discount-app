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
              size={16}
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
    marginHorizontal: 4,
    marginVertical: 4,
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 120,
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
    fontSize: 11,
  },
  discountBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#E74C3C',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  favoriteButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteIconButton: {
    margin: 0,
  },
  supermarketBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  supermarketText: {
    fontWeight: '600',
    fontSize: 11,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
  },
  title: {
    marginBottom: 2,
    lineHeight: 18,
    fontSize: 13,
  },
  unitInfo: {
    color: '#666',
    marginBottom: 4,
    fontSize: 11,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
    fontSize: 12,
  },
  discountPrice: {
    color: '#E74C3C',
    fontWeight: 'bold',
    fontSize: 15,
  },
  validUntil: {
    color: '#888',
    marginTop: 2,
    fontSize: 10,
  },
});
