/**
 * App Entry Point
 * SupermarktDeals - Dutch Supermarket Discount Aggregator
 * Full-featured web-compatible version
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  RefreshControl,
} from 'react-native';
import { supabase } from './src/config/supabase';

// Types
interface Supermarket {
  id: string;
  name: string;
  slug: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  title: string;
  description?: string;
  discount_price: number;
  original_price?: number;
  discount_percentage?: number;
  image_url?: string;
  product_url?: string;
  unit_info?: string;
  valid_from?: string;
  valid_until?: string;
  supermarket?: Supermarket;
  category?: Category;
}

// Tab type
type TabType = 'home' | 'favorites' | 'settings';

export default function App() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSupermarkets, setSelectedSupermarkets] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Favorites (stored in memory for web)
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Non-halal keywords to filter out (alcohol, pork, etc.)
  const NON_HALAL_KEYWORDS = [
    // Alcohol
    'bier', 'wijn', 'whisky', 'whiskey', 'vodka', 'gin', 'rum', 'likeur',
    'alcohol', 'jenever', 'cognac', 'port', 'sherry', 'champagne', 'prosecco',
    'rosé', 'cava', 'sangria', 'aperol', 'martini', 'bacardi', 'heineken',
    'amstel', 'grolsch', 'hertog jan', 'brand', 'jupiler', 'bavaria',
    // Pork/swine
    'varken', 'varkens', 'spek', 'bacon', 'ham', 'worst', 'chorizo', 'salami',
    'parmaham', 'serrano', 'pancetta', 'prosciutto', 'braadworst', 'rookworst',
    'knakworst', 'frikandel', 'gehakt', 'carbonade', 'ribkarbonade',
    // Gelatin (often pork-derived)
    'gelatine',
  ];

  // Check if product is halal (doesn't contain non-halal keywords)
  const isHalal = (product: Product): boolean => {
    const text = `${product.title} ${product.description || ''} ${product.unit_info || ''}`.toLowerCase();
    return !NON_HALAL_KEYWORDS.some(keyword => text.includes(keyword));
  };

  // Fetch supermarkets and categories
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const [supermarketsRes, categoriesRes] = await Promise.all([
          supabase.from('supermarkets').select('*').order('name'),
          supabase.from('categories').select('*').order('name'),
        ]);

        if (supermarketsRes.data) setSupermarkets(supermarketsRes.data);
        if (categoriesRes.data) setCategories(categoriesRes.data);
      } catch (e) {
        console.error('Failed to fetch metadata:', e);
      }
    }
    fetchMetadata();
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setError(null);
      let query = supabase
        .from('products')
        .select('*, supermarket:supermarkets(*), category:categories(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Apply supermarket filter
      if (selectedSupermarkets.length > 0) {
        query = query.in('supermarket_id', selectedSupermarkets);
      }

      // Apply category filter
      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        query = query.ilike('title', `%${searchQuery.trim()}%`);
      }

      query = query.limit(50);

      const { data, error } = await query;
      if (error) throw error;
      // Filter out non-halal products
      const halalProducts = (data || []).filter(isHalal);
      setProducts(halalProducts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSupermarkets, selectedCategory, searchQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleSupermarket = (id: string) => {
    setSelectedSupermarkets(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const favoriteProducts = products.filter(p => favorites.has(p.id));

  // Product Card Component
  const ProductCard = ({ item, onPress }: { item: Product; onPress: () => void }) => {
    const isFavorite = favorites.has(item.id);
    const discountPercent = item.discount_percentage ||
      (item.original_price ? Math.round((1 - item.discount_price / item.original_price) * 100) : null);

    // Format deal type text with proper spacing
    const formatDealType = (text: string): string => {
      // Add space between "voor" and number: "2 voor2.89" -> "2 voor 2.89"
      let formatted = text.replace(/voor(\d)/gi, 'voor $1');
      // Add space between "voor" and euro sign: "voor€" -> "voor €"
      formatted = formatted.replace(/voor€/gi, 'voor €');
      // Add space after percentage if missing: "25%korting" -> "25% korting"
      formatted = formatted.replace(/(\d+%)([a-z])/gi, '$1 $2');
      return formatted;
    };

    // Get deal type text - use unit_info or description if it contains deal info
    const getDealType = (): string | null => {
      const dealPatterns = [
        /\d+\s*(voor|voor)\s*[€]?\s*\d+[,.]?\d*/i, // "2 voor 2.89"
        /\d+\s*\+\s*\d+\s*(gratis)?/i, // "1+1 gratis"
        /\d+e?\s*(halve prijs|gratis)/i, // "2e gratis", "2e halve prijs"
        /\d+%\s*(korting|extra)?/i, // "25% korting"
        /alle\s+\d+\s+voor/i, // "alle 3 voor"
        /nu\s+[€]?\s*\d+[,.]?\d*/i, // "nu €1.99"
      ];

      const textToCheck = item.unit_info || item.description || '';
      for (const pattern of dealPatterns) {
        const match = textToCheck.match(pattern);
        if (match) {
          return formatDealType(match[0]);
        }
      }
      // If unit_info exists and is short, show it as deal type
      if (item.unit_info && item.unit_info.length < 25) {
        return formatDealType(item.unit_info);
      }
      return null;
    };

    const dealType = getDealType();

    return (
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.cardImageContainer}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.cardImage} />
          ) : (
            <View style={styles.cardImagePlaceholder}>
              <Text style={styles.placeholderText}>Geen afbeelding</Text>
            </View>
          )}
          {/* Deal Type Badge (top-left, prominent) */}
          {dealType && (
            <View style={styles.dealTypeBadge}>
              <Text style={styles.dealTypeBadgeText}>{dealType}</Text>
            </View>
          )}
          {/* Discount Percentage Badge (below deal type if both exist) */}
          {!dealType && discountPercent && discountPercent > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>-{discountPercent}%</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
          >
            <Text style={styles.favoriteIcon}>{isFavorite ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          {/* Supermarket badge at bottom-left of image */}
          {item.supermarket && (
            <View style={styles.supermarketImageBadge}>
              <Text style={styles.supermarketImageBadgeText}>{item.supermarket.name}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {/* Price section - show old price strikethrough and new price */}
          <View style={styles.priceSection}>
            {item.original_price && item.original_price > item.discount_price && (
              <Text style={styles.originalPrice}>was €{item.original_price.toFixed(2)}</Text>
            )}
            <View style={styles.priceRow}>
              <Text style={styles.discountPrice}>
                {item.discount_price > 0 ? `€${item.discount_price.toFixed(2)}` : 'Zie winkel'}
              </Text>
              {discountPercent && discountPercent > 0 && dealType && (
                <View style={styles.smallDiscountBadge}>
                  <Text style={styles.smallDiscountBadgeText}>-{discountPercent}%</Text>
                </View>
              )}
            </View>
          </View>
          {/* Link to product page for verification */}
          {item.product_url && (
            <TouchableOpacity
              style={styles.verifyLink}
              onPress={(e) => {
                e.stopPropagation();
                window.open(item.product_url, '_blank');
              }}
            >
              <Text style={styles.verifyLinkText}>🔗 Bekijk in winkel</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Product Detail Modal
  const ProductDetailModal = () => {
    if (!selectedProduct) return null;

    const p = selectedProduct;
    const discountPercent = p.discount_percentage ||
      (p.original_price ? Math.round((1 - p.discount_price / p.original_price) * 100) : null);

    return (
      <Modal visible={!!selectedProduct} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedProduct(null)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false}>
              {p.image_url && (
                <Image source={{ uri: p.image_url }} style={styles.modalImage} />
              )}

              <View style={styles.modalBody}>
                {p.supermarket && (
                  <View style={styles.supermarketTag}>
                    <Text style={styles.supermarketTagText}>{p.supermarket.name}</Text>
                  </View>
                )}

                <Text style={styles.modalTitle}>{p.title}</Text>

                {p.description && (
                  <Text style={styles.modalDescription}>{p.description}</Text>
                )}

                {p.unit_info && (
                  <Text style={styles.modalUnit}>{p.unit_info}</Text>
                )}

                <View style={styles.modalPriceSection}>
                  {p.original_price && p.original_price > p.discount_price && (
                    <Text style={styles.modalOriginalPrice}>€{p.original_price.toFixed(2)}</Text>
                  )}
                  <Text style={styles.modalDiscountPrice}>€{p.discount_price.toFixed(2)}</Text>
                  {discountPercent && discountPercent > 0 && (
                    <View style={styles.modalDiscountBadge}>
                      <Text style={styles.modalDiscountBadgeText}>-{discountPercent}%</Text>
                    </View>
                  )}
                </View>

                {p.valid_until && (
                  <Text style={styles.modalValidity}>
                    Geldig t/m {new Date(p.valid_until).toLocaleDateString('nl-NL')}
                  </Text>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.favoriteModalButton]}
                    onPress={() => toggleFavorite(p.id)}
                  >
                    <Text style={styles.modalButtonText}>
                      {favorites.has(p.id) ? '❤️ Favoriet' : '🤍 Toevoegen aan favorieten'}
                    </Text>
                  </TouchableOpacity>

                  {p.product_url && (
                    <TouchableOpacity
                      style={[styles.modalButton, styles.linkButton]}
                      onPress={() => window.open(p.product_url, '_blank')}
                    >
                      <Text style={styles.linkButtonText}>Bekijk op website →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Filter Section
  const FilterSection = () => (
    <View style={styles.filterSection}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Zoek producten..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Supermarket Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {supermarkets.map(sm => (
          <TouchableOpacity
            key={sm.id}
            style={[
              styles.filterChip,
              selectedSupermarkets.includes(sm.id) && styles.filterChipActive
            ]}
            onPress={() => toggleSupermarket(sm.id)}
          >
            <Text style={[
              styles.filterChipText,
              selectedSupermarkets.includes(sm.id) && styles.filterChipTextActive
            ]}>
              {sm.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
            Alles
          </Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive
            ]}
            onPress={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
          >
            <Text style={[
              styles.categoryChipText,
              selectedCategory === cat.id && styles.categoryChipTextActive
            ]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // Home Screen
  const HomeScreen = () => (
    <View style={styles.screen}>
      <FilterSection />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Aanbiedingen laden...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Fout: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProducts}>
            <Text style={styles.retryButtonText}>Opnieuw proberen</Text>
          </TouchableOpacity>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>Geen producten gevonden</Text>
          <Text style={styles.emptySubtext}>Probeer andere filters</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.productList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066CC']} />
          }
          renderItem={({ item }) => (
            <ProductCard item={item} onPress={() => setSelectedProduct(item)} />
          )}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{products.length} aanbiedingen</Text>
          }
        />
      )}
    </View>
  );

  // Favorites Screen
  const FavoritesScreen = () => (
    <View style={styles.screen}>
      {favoriteProducts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyText}>Geen favorieten</Text>
          <Text style={styles.emptySubtext}>Voeg producten toe door op het hartje te klikken</Text>
        </View>
      ) : (
        <FlatList
          data={favoriteProducts}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.productList}
          renderItem={({ item }) => (
            <ProductCard item={item} onPress={() => setSelectedProduct(item)} />
          )}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{favoriteProducts.length} favorieten</Text>
          }
        />
      )}
    </View>
  );

  // Settings Screen
  const SettingsScreen = () => (
    <View style={styles.screen}>
      <View style={styles.settingsContainer}>
        <Text style={styles.settingsTitle}>Instellingen</Text>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsCardTitle}>Over SupermarktDeals</Text>
          <Text style={styles.settingsText}>
            Vergelijk aanbiedingen van Nederlandse supermarkten op één plek.
          </Text>
          <Text style={styles.settingsText}>
            Ondersteunde winkels: Albert Heijn, Jumbo, Lidl
          </Text>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsCardTitle}>Statistieken</Text>
          <Text style={styles.settingsText}>Totaal producten: {products.length}</Text>
          <Text style={styles.settingsText}>Favorieten: {favorites.size}</Text>
          <Text style={styles.settingsText}>Supermarkten: {supermarkets.length}</Text>
        </View>

        <TouchableOpacity style={styles.clearButton} onPress={() => setFavorites(new Set())}>
          <Text style={styles.clearButtonText}>Wis alle favorieten</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SupermarktDeals</Text>
        <Text style={styles.headerSubtitle}>
          {activeTab === 'home' ? 'Alle aanbiedingen' :
           activeTab === 'favorites' ? 'Mijn favorieten' : 'Instellingen'}
        </Text>
      </View>

      {/* Content */}
      {activeTab === 'home' && <HomeScreen />}
      {activeTab === 'favorites' && <FavoritesScreen />}
      {activeTab === 'settings' && <SettingsScreen />}

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'home' && styles.tabActive]}
          onPress={() => setActiveTab('home')}
        >
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
        >
          <Text style={styles.tabIcon}>❤️</Text>
          <Text style={[styles.tabLabel, activeTab === 'favorites' && styles.tabLabelActive]}>
            Favorieten {favorites.size > 0 && `(${favorites.size})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>Instellingen</Text>
        </TouchableOpacity>
      </View>

      {/* Product Detail Modal */}
      <ProductDetailModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#0066CC',
    padding: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },

  // Filter Section
  filterSection: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  clearSearch: {
    fontSize: 16,
    color: '#999',
    padding: 4,
  },
  filterScroll: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filterChip: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  filterChipText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: 'white',
  },
  categoryChip: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryChipActive: {
    borderBottomColor: '#0066CC',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#0066CC',
    fontWeight: '600',
  },

  // Product List
  productList: {
    padding: 8,
  },
  resultCount: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  // Product Card
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    maxWidth: '48%',
  },
  cardImageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1, // Square images for better quality
    backgroundColor: '#f5f5f5',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain', // Preserve image quality, show full image
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eee',
  },
  placeholderText: {
    color: '#999',
    fontSize: 12,
  },
  dealTypeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#27AE60',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    maxWidth: '80%',
  },
  dealTypeBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#E74C3C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  discountBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  supermarketImageBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  supermarketImageBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteIcon: {
    fontSize: 18,
  },
  cardContent: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 20,
  },
  cardSupermarket: {
    fontSize: 12,
    color: '#0066CC',
    marginBottom: 4,
  },
  cardUnit: {
    fontSize: 11,
    color: '#999',
    marginBottom: 8,
  },
  priceSection: {
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  originalPrice: {
    fontSize: 11,
    color: '#999',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  discountPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E74C3C',
  },
  smallDiscountBadge: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  smallDiscountBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  verifyLink: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f0f8ff',
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0066CC',
  },
  verifyLinkText: {
    color: '#0066CC',
    fontSize: 11,
    fontWeight: '600',
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingBottom: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#0066CC',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
  },
  tabLabelActive: {
    color: '#0066CC',
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#333',
  },
  modalImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  modalBody: {
    padding: 20,
  },
  supermarketTag: {
    backgroundColor: '#0066CC',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 12,
  },
  supermarketTagText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 22,
  },
  modalUnit: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  modalPriceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  modalOriginalPrice: {
    fontSize: 18,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  modalDiscountPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#E74C3C',
  },
  modalDiscountBadge: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modalDiscountBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalValidity: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalActions: {
    gap: 12,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  favoriteModalButton: {
    backgroundColor: '#f5f5f5',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  linkButton: {
    backgroundColor: '#0066CC',
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },

  // Settings
  settingsContainer: {
    padding: 20,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  settingsCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  settingsCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  settingsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  clearButton: {
    backgroundColor: '#E74C3C',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
