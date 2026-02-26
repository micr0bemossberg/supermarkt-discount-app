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
} from 'react-native';
import {
  Appbar,
  Text,
  Button,
  Surface,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { Image } from 'expo-image';
import { useFavoritesStore } from '../stores/favoritesStore';
import { getProductById } from '../services/products';
import { formatPrice, formatDate, getValidityText } from '../utils/formatters';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ProductWithRelations } from '@supermarkt-deals/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

const { width } = Dimensions.get('window');

export const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { productId } = route.params;
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
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Product Details" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Product niet gevonden" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <Text>Product niet gevonden</Text>
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

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="" />
        <Appbar.Action
          icon={favorite ? 'heart' : 'heart-outline'}
          onPress={handleFavoriteToggle}
        />
        <Appbar.Action icon="share-variant" onPress={handleShare} />
      </Appbar.Header>

      <ScrollView>
        {/* Product Image */}
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
              <Text>Geen afbeelding beschikbaar</Text>
            </View>
          )}

          {/* Discount Badge */}
          {discountPercentage && discountPercentage > 0 && (
            <Surface style={styles.discountBadge} elevation={2}>
              <Text variant="headlineSmall" style={styles.discountText}>
                -{discountPercentage}%
              </Text>
            </Surface>
          )}
        </View>

        <View style={styles.content}>
          {/* Supermarket Badge */}
          {product.supermarket && (
            <Chip
              icon="store"
              style={styles.supermarketChip}
              textStyle={styles.supermarketChipText}
            >
              {product.supermarket.name}
            </Chip>
          )}

          {/* Card Required Notice */}
          {product.requires_card && (
            <Surface style={styles.cardNotice} elevation={0}>
              <Text variant="bodySmall" style={styles.cardNoticeText}>
                Pas of app vereist — voor deze aanbieding heb je een klantenkaart of de app van{' '}
                {product.supermarket?.name || 'de winkel'} nodig.
              </Text>
            </Surface>
          )}

          {/* Title */}
          <Text variant="headlineSmall" style={styles.title}>
            {product.title}
          </Text>

          {/* Description */}
          {product.description && (
            <Text variant="bodyMedium" style={styles.description}>
              {product.description}
            </Text>
          )}

          {/* Unit Info */}
          {product.unit_info && (
            <Text variant="bodySmall" style={styles.unitInfo}>
              {product.unit_info}
            </Text>
          )}

          {/* Prices */}
          <Surface style={styles.priceContainer} elevation={1}>
            {product.original_price && (
              <View style={styles.originalPriceRow}>
                <Text variant="bodySmall" style={styles.label}>
                  Normale prijs:
                </Text>
                <Text variant="bodyLarge" style={styles.originalPrice}>
                  {formatPrice(product.original_price)}
                </Text>
              </View>
            )}

            <View style={styles.discountPriceRow}>
              <Text variant="bodySmall" style={styles.label}>
                Aanbieding:
              </Text>
              <Text variant="displaySmall" style={styles.discountPrice}>
                {formatPrice(product.discount_price)}
              </Text>
            </View>

            {product.original_price && discountPercentage && (
              <Text variant="bodyMedium" style={styles.savings}>
                Bespaar {formatPrice(product.original_price - product.discount_price)}
              </Text>
            )}
          </Surface>

          {/* Validity Period */}
          <Surface style={styles.validityContainer} elevation={0}>
            <Text variant="bodySmall" style={styles.validityLabel}>
              Geldigheid
            </Text>
            <Text variant="bodyMedium" style={styles.validityText}>
              {formatDate(product.valid_from)} t/m {formatDate(product.valid_until)}
            </Text>
            <Text variant="bodySmall" style={styles.validityStatus}>
              {validityText}
            </Text>
          </Surface>

          {/* Category */}
          {product.category && (
            <View style={styles.categoryRow}>
              <Text variant="bodySmall" style={styles.label}>
                Categorie:
              </Text>
              <Chip compact>{product.category.name}</Chip>
            </View>
          )}

          {/* Action Buttons */}
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={handleOpenInStore}
            style={styles.storeButton}
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
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: width,
    backgroundColor: '#f5f5f5',
    position: 'relative',
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
  discountBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  discountText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
  },
  supermarketChip: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  supermarketChipText: {
    fontWeight: '600',
  },
  cardNotice: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  cardNoticeText: {
    color: '#E65100',
    fontWeight: '500',
  },
  title: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  description: {
    marginBottom: 12,
    color: '#666',
  },
  unitInfo: {
    marginBottom: 16,
    color: '#999',
  },
  priceContainer: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
  },
  originalPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  discountPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: '#666',
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  discountPrice: {
    color: '#E74C3C',
    fontWeight: 'bold',
  },
  savings: {
    color: '#00A86B',
    fontWeight: '600',
    textAlign: 'right',
  },
  validityContainer: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  validityLabel: {
    color: '#856404',
    marginBottom: 4,
  },
  validityText: {
    color: '#856404',
    fontWeight: '600',
    marginBottom: 4,
  },
  validityStatus: {
    color: '#856404',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  storeButton: {
    marginTop: 8,
  },
});
