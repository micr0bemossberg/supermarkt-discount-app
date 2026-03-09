/**
 * ProductCard Component
 * Modern card with supermarket color accent, product image,
 * discount badge, prices, and urgency indicator.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Image } from 'expo-image';
import { useFavoritesStore } from '../stores/favoritesStore';
import { formatPrice, getValidityText, daysUntil, getSupermarketColor } from '../utils/formatters';
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
  const days = daysUntil(product.valid_until);
  const isUrgent = days >= 0 && days <= 2;
  const brandColor = getSupermarketColor(product.supermarket?.slug || '');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {/* Supermarket color accent bar */}
      <View style={[styles.accentBar, { backgroundColor: brandColor }]} />

      {/* Image area */}
      <View style={styles.imageContainer}>
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={styles.image}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderText}>Geen afbeelding</Text>
          </View>
        )}

        {/* Discount Badge */}
        {discountPercentage != null && discountPercentage > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPercentage}%</Text>
          </View>
        )}

        {/* Favorite Button */}
        <View style={styles.favoriteButton}>
          <IconButton
            icon={favorite ? 'heart' : 'heart-outline'}
            iconColor={favorite ? '#E53935' : '#9E9E9E'}
            size={18}
            onPress={handleFavoriteToggle}
            style={styles.favoriteIcon}
          />
        </View>

        {/* Card Required Badge */}
        {product.requires_card && (
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>Pas</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Supermarket name */}
        <View style={styles.supermarketRow}>
          <View style={[styles.supermarketDot, { backgroundColor: brandColor }]} />
          <Text style={styles.supermarketName} numberOfLines={1}>
            {product.supermarket?.name || ''}
          </Text>
        </View>

        {/* Product Title */}
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>

        {/* Prices */}
        <View style={styles.priceRow}>
          <Text style={styles.discountPrice}>
            {formatPrice(product.discount_price)}
          </Text>
          {product.original_price && (
            <Text style={styles.originalPrice}>
              {formatPrice(product.original_price)}
            </Text>
          )}
        </View>

        {/* Validity */}
        <View style={[styles.validityRow, isUrgent && styles.validityUrgent]}>
          <Text style={[styles.validUntil, isUrgent && styles.validUntilUrgent]}>
            {validityText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 4,
    marginVertical: 5,
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 130,
    backgroundColor: '#FAFAFA',
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
    backgroundColor: '#F5F5F5',
  },
  placeholderText: {
    color: '#BDBDBD',
    fontSize: 11,
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#C62828',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  favoriteButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 10,
  },
  favoriteIcon: {
    margin: 0,
  },
  cardBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#FF8F00',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 9,
  },
  content: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  supermarketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  supermarketDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  supermarketName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212529',
    lineHeight: 17,
    marginBottom: 6,
    minHeight: 34,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  discountPrice: {
    color: '#1B5E20',
    fontWeight: '800',
    fontSize: 16,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#BDBDBD',
    fontSize: 12,
  },
  validityRow: {
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
  },
  validityUrgent: {
    borderTopColor: '#FFCDD2',
  },
  validUntil: {
    color: '#9E9E9E',
    fontSize: 10,
    fontWeight: '500',
  },
  validUntilUrgent: {
    color: '#C62828',
    fontWeight: '700',
  },
});
