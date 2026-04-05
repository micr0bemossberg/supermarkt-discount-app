/**
 * ProductCard Component
 * Modern card with supermarket color accent, product image,
 * discount badge, prices, and urgency indicator.
 */

import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useFavoritesStore } from '../stores/favoritesStore';
import { formatPrice, getValidityText, daysUntil, getSupermarketColor } from '../utils/formatters';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

function formatDealType(dealType: string): string | null {
  const map: Record<string, string> = {
    '1+1_gratis': '1+1 Gratis',
    '2+1_gratis': '2+1 Gratis',
    '3+2_gratis': '3+2 Gratis',
    '2e_halve_prijs': '2e Halve Prijs',
    'x_voor_y': 'Multikoop',
    'korting': 'Korting',
    'bonus': 'Bonus',
    'extra': "Extra's",
    'stunt': 'Stunt',
    'weekend_actie': 'Weekendactie',
    'dag_actie': 'Dagactie',
    'combinatie_korting': 'Combikorting',
    'gratis_bijproduct': 'Gratis Bijproduct',
  };
  // Handle dynamic patterns like "3+2_gratis"
  if (/^\d\+\d_gratis$/.test(dealType)) {
    return dealType.replace('_gratis', ' Gratis');
  }
  return map[dealType] || null;
}

interface ProductCardProps {
  product: ProductWithRelations;
  onPress: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onPress }) => {
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();
  const favorite = isFavorite(product.id);

  const handleFavoriteToggle = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (favorite) {
      removeFavorite(product.id);
    } else {
      addFavorite(product);
    }
  };

  const discountPercentage =
    product.discount_percentage ||
    (product.original_price && product.original_price > product.discount_price
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

  // Format deal_type for display — prefer raw description for richer labels
  const dealTypeLabel = product.description && product.deal_type
    ? (product.deal_type === 'x_voor_y' || product.deal_type === 'bonus' || product.deal_type === 'korting'
        ? product.description  // Use raw text: "2 voor 4.00", "20% korting", etc.
        : formatDealType(product.deal_type) || product.description)
    : product.deal_type ? formatDealType(product.deal_type) : null;
  const isOnlineOnly = (product as any).is_online_only || product.supermarket?.is_online_only;

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

        {/* Discount / Deal Badge */}
        {discountPercentage != null && discountPercentage > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPercentage}%</Text>
          </View>
        ) : dealTypeLabel && dealTypeLabel !== 'Bonus' && dealTypeLabel !== 'Korting' ? (
          <View style={[styles.discountBadge, styles.dealBadge]}>
            <Text style={styles.discountText}>{dealTypeLabel}</Text>
          </View>
        ) : null}

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

        {/* Card/Voucher Required Badge */}
        {product.requires_card && (
          <View style={[
            styles.cardBadge,
            product.unit_info?.includes('Vomar app') && styles.voucherBadge,
          ]}>
            <Text style={styles.cardBadgeText}>
              {product.unit_info?.includes('Vomar app') ? 'Voucher' : 'Pas'}
            </Text>
          </View>
        )}

        {/* Online Only Badge */}
        {isOnlineOnly && (
          <View style={styles.onlineBadge}>
            <Text style={styles.onlineBadgeText}>Online</Text>
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

        {/* Deal type label (skip generic "Bonus" — adds no info) */}
        {dealTypeLabel && dealTypeLabel !== 'Bonus' && (
          <Text style={styles.dealTypeText}>{dealTypeLabel}</Text>
        )}

        {/* Prices */}
        <View style={styles.priceRow}>
          <Text style={styles.discountPrice}>
            {formatPrice(product.discount_price)}
          </Text>
          {product.original_price && product.original_price > product.discount_price && (
            <Text style={styles.originalPrice}>
              {formatPrice(product.original_price)}
            </Text>
          )}
        </View>

        {/* Unit info */}
        {product.unit_info && !product.unit_info.includes('Vomar app') && (
          <Text style={styles.unitInfoText} numberOfLines={1}>{product.unit_info}</Text>
        )}

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
  dealBadge: {
    backgroundColor: '#2E7D32',
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
  voucherBadge: {
    backgroundColor: '#7B1FA2',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#1565C0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  onlineBadgeText: {
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
    marginBottom: 4,
    minHeight: 34,
  },
  dealTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 3,
  },
  unitInfoText: {
    fontSize: 10,
    color: '#757575',
    marginTop: 1,
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
