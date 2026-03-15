/**
 * ProductDetailScreen
 * Shows detailed information about a single product
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  Share,
  Dimensions,
  Pressable,
} from 'react-native';
import {
  Text,
  Button,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFavoritesStore } from '../stores/favoritesStore';
import { getProductById } from '../services/products';
import { formatPrice, formatDate, getValidityText, daysUntil, getSupermarketColor } from '../utils/formatters';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const { width } = Dimensions.get('window');

export const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { productId } = route.params;
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const { isFavorite, addFavorite, removeFavorite } = useFavoritesStore();

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const loadProduct = async () => {
    try {
      const data = await getProductById(productId);
      setProduct(data);
    } catch (error) {
      console.error('Failed to load product:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = () => {
    if (!product) return;

    if (isFavorite(product.id)) {
      removeFavorite(product.id);
    } else {
      addFavorite(product);
    }
  };

  const handleOpenInStore = () => {
    if (product?.product_url) {
      Linking.openURL(product.product_url);
    } else if (product?.supermarket?.website_url) {
      Linking.openURL(product.supermarket.website_url);
    }
  };

  const handleShare = async () => {
    if (!product) return;

    try {
      await Share.share({
        message: `${product.title} - ${formatPrice(product.discount_price)} bij ${product.supermarket?.name}`,
        url: product.product_url || product.supermarket?.website_url || '',
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1B5E20" />
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundText}>Product niet gevonden</Text>
        </View>
      </View>
    );
  }

  const discountPercentage =
    product.discount_percentage ||
    (product.original_price
      ? Math.round(
          ((product.original_price - product.discount_price) /
            product.original_price) *
            100
        )
      : null);

  const favorite = isFavorite(product.id);
  const validityText = getValidityText(product.valid_until);
  const days = daysUntil(product.valid_until);
  const isUrgent = days >= 0 && days <= 2;
  const brandColor = getSupermarketColor(product.supermarket?.slug || '');
  const savings = product.original_price
    ? product.original_price - product.discount_price
    : 0;

  return (
    <View style={styles.container}>
      {/* Floating top bar over image */}
      <View style={[styles.topBar, { top: insets.top }]}>
        <IconButton
          icon="arrow-left"
          onPress={() => navigation.goBack()}
          style={styles.topBarButton}
          iconColor="#333"
        />
        <View style={styles.topBarRight}>
          <IconButton
            icon={favorite ? 'heart' : 'heart-outline'}
            onPress={handleFavoriteToggle}
            style={styles.topBarButton}
            iconColor={favorite ? '#E53935' : '#333'}
          />
          <IconButton
            icon="share-variant"
            onPress={handleShare}
            style={styles.topBarButton}
            iconColor="#333"
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false}>
        {/* Product Image */}
        <View style={styles.imageContainer}>
          <View style={[styles.imageBrandBar, { backgroundColor: brandColor }]} />
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.image}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={48} color="#BDBDBD" />
              <Text style={styles.placeholderText}>Geen afbeelding</Text>
            </View>
          )}

          {/* Discount Badge */}
          {discountPercentage != null && discountPercentage > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discountPercentage}%</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Supermarket + Category row */}
          <View style={styles.metaRow}>
            <Pressable style={[styles.supermarketPill, { backgroundColor: brandColor }]}>
              <Text style={styles.supermarketPillText}>
                {product.supermarket?.name || ''}
              </Text>
            </Pressable>
            {product.category && (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>{product.category.name}</Text>
              </View>
            )}
          </View>

          {/* Card/Voucher Required Notice */}
          {product.requires_card && (
            <View style={product.unit_info?.includes('Vomar app') ? styles.voucherNotice : styles.cardNotice}>
              <MaterialCommunityIcons
                name={product.unit_info?.includes('Vomar app') ? 'ticket-percent' : 'card-account-details'}
                size={16}
                color={product.unit_info?.includes('Vomar app') ? '#7B1FA2' : '#E65100'}
              />
              <Text style={product.unit_info?.includes('Vomar app') ? styles.voucherNoticeText : styles.cardNoticeText}>
                {product.unit_info?.includes('Vomar app')
                  ? 'Activeer voucher in de Vomar-app voor deze korting'
                  : `Pas of app van ${product.supermarket?.name || 'de winkel'} vereist`}
              </Text>
            </View>
          )}

          {/* Online Only Notice */}
          {product.supermarket?.is_online_only && (
            <View style={styles.onlineNotice}>
              <MaterialCommunityIcons name="web" size={16} color="#1565C0" />
              <Text style={styles.onlineNoticeText}>
                Alleen online verkrijgbaar bij {product.supermarket?.name || 'deze winkel'}
              </Text>
            </View>
          )}

          {/* Title */}
          <Text style={styles.title}>{product.title}</Text>

          {/* Description */}
          {product.description && (
            <Text style={styles.description}>{product.description}</Text>
          )}

          {/* Unit Info */}
          {product.unit_info && (
            <Text style={styles.unitInfo}>{product.unit_info}</Text>
          )}

          {/* Price Card */}
          <View style={styles.priceCard}>
            <View style={styles.priceMain}>
              <Text style={styles.priceLabel}>Aanbiedingsprijs</Text>
              <Text style={styles.priceValue}>
                {formatPrice(product.discount_price)}
              </Text>
            </View>

            {product.original_price && (
              <>
                <View style={styles.priceDivider} />
                <View style={styles.priceSecondary}>
                  <View style={styles.priceSecondaryRow}>
                    <Text style={styles.priceSecondaryLabel}>Normaal</Text>
                    <Text style={styles.originalPrice}>
                      {formatPrice(product.original_price)}
                    </Text>
                  </View>
                  {savings > 0 && (
                    <View style={styles.savingsRow}>
                      <MaterialCommunityIcons name="piggy-bank-outline" size={16} color="#1B5E20" />
                      <Text style={styles.savingsText}>
                        Bespaar {formatPrice(savings)}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Validity */}
          <View style={[styles.validityCard, isUrgent && styles.validityCardUrgent]}>
            <MaterialCommunityIcons
              name={isUrgent ? 'clock-alert-outline' : 'calendar-range'}
              size={20}
              color={isUrgent ? '#C62828' : '#616161'}
            />
            <View style={styles.validityContent}>
              <Text style={[styles.validityMain, isUrgent && styles.validityMainUrgent]}>
                {validityText}
              </Text>
              <Text style={styles.validityDates}>
                {formatDate(product.valid_from)} t/m {formatDate(product.valid_until)}
              </Text>
            </View>
          </View>

          {/* CTA Button */}
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={handleOpenInStore}
            style={styles.ctaButton}
            buttonColor={brandColor}
            contentStyle={styles.ctaButtonContent}
            labelStyle={styles.ctaButtonLabel}
          >
            Bekijk bij {product.supermarket?.name}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: '#757575',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topBarRight: {
    flexDirection: 'row',
  },
  topBarButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    margin: 4,
  },
  imageContainer: {
    width: '100%',
    height: width * 0.85,
    backgroundColor: '#FAFAFA',
    position: 'relative',
  },
  imageBrandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    zIndex: 1,
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
    fontSize: 13,
    marginTop: 8,
  },
  discountBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#C62828',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  discountText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  content: {
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  supermarketPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  supermarketPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F1F3F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryPillText: {
    color: '#616161',
    fontWeight: '600',
    fontSize: 12,
  },
  cardNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  cardNoticeText: {
    color: '#E65100',
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },
  voucherNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#F3E5F5',
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  voucherNoticeText: {
    color: '#7B1FA2',
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },
  onlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  onlineNoticeText: {
    color: '#1565C0',
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#212529',
    marginBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  description: {
    fontSize: 14,
    marginBottom: 12,
    color: '#616161',
    lineHeight: 20,
  },
  unitInfo: {
    fontSize: 13,
    marginBottom: 16,
    color: '#9E9E9E',
  },
  priceCard: {
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#F8FFF8',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    overflow: 'hidden',
  },
  priceMain: {
    padding: 16,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1B5E20',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#C8E6C9',
  },
  priceSecondary: {
    padding: 12,
  },
  priceSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  priceSecondaryLabel: {
    fontSize: 13,
    color: '#757575',
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#BDBDBD',
    fontSize: 16,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savingsText: {
    color: '#1B5E20',
    fontWeight: '700',
    fontSize: 14,
  },
  validityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  validityCardUrgent: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFCDD2',
  },
  validityContent: {
    flex: 1,
  },
  validityMain: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    marginBottom: 2,
  },
  validityMainUrgent: {
    color: '#C62828',
  },
  validityDates: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  ctaButton: {
    borderRadius: 14,
    elevation: 3,
  },
  ctaButtonContent: {
    paddingVertical: 6,
  },
  ctaButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
