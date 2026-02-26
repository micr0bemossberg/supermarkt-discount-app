/**
 * ShoppingPlanScreen
 * Shows optimized shopping plan: items grouped by cheapest supermarket + route
 * - Product URLs are tappable
 * - Discount type shown per item (1+1, percentage, etc.)
 * - Supermarket sections are expandable/collapsible
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, SectionList, Linking, ActivityIndicator, Pressable } from 'react-native';
import { Appbar, Text, Card, Button, Chip, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroceryListStore } from '../stores/groceryListStore';
import { matchGroceryListToDeals } from '../services/groceryMatcher';
import { generateShoppingPlan, type ShoppingPlan } from '../services/shoppingPlanOptimizer';
import { planRoute, type Route } from '../services/routePlanner';
import { formatPrice, getSupermarketColor } from '../utils/formatters';
import { EmptyState } from '../components/EmptyState';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShoppingPlan'>;

type SectionData =
  | { type: 'summary'; plan: ShoppingPlan; route: Route | null }
  | { type: 'storeItem'; groceryName: string; dealTitle: string; price: number; productId: string; productUrl: string | null; discountLabel: string | null; originalPrice: number | null }
  | { type: 'unmatched'; name: string }
  | { type: 'routeStop'; storeName: string; address: string; distance: number }
  | { type: 'routeAction'; googleMapsUrl: string; totalDistance: number };

interface Section {
  key: string;
  title: string;
  color?: string;
  subtitle?: string;
  collapsible?: boolean;
  data: SectionData[];
}

/**
 * Extract discount label from a deal product.
 * Checks title parentheses first (e.g. "(1+1 gratis)"), then falls back to percentage.
 */
function getDiscountLabel(title: string, discountPercentage: number | null, originalPrice: number | null, discountPrice: number): string | null {
  // Try to extract deal type from parentheses in title
  const parenMatch = title.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const label = parenMatch[1];
    // Common deal types: "1+1 gratis", "2e halve prijs", "50% korting", "2+1 gratis", etc.
    if (/gratis|korting|halve prijs|voor\s*€/i.test(label)) {
      return label;
    }
  }

  // Fall back to discount percentage
  if (discountPercentage && discountPercentage > 0) {
    return `${discountPercentage}% korting`;
  }

  // Calculate from original vs discount price
  if (originalPrice && originalPrice > discountPrice) {
    const pct = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
    if (pct > 0) return `${pct}% korting`;
  }

  return null;
}

export const ShoppingPlanScreen: React.FC<Props> = ({ navigation }) => {
  const { items } = useGroceryListStore();
  const [plan, setPlan] = useState<ShoppingPlan | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const uncheckedItems = useMemo(() => items.filter((i) => !i.checked), [items]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        setLoading(true);
        setError(null);

        const matched = await matchGroceryListToDeals(uncheckedItems);
        if (cancelled) return;

        const shoppingPlan = generateShoppingPlan(matched);
        setPlan(shoppingPlan);

        const physicalSupermarkets = shoppingPlan.storeVisits.map((v) => v.supermarket);
        if (physicalSupermarkets.length > 0) {
          setRoute(planRoute(physicalSupermarkets));
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Winkelplan maken mislukt');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [uncheckedItems]);

  // Build sections — filter out items for collapsed sections
  const sections: Section[] = useMemo(() => {
    if (!plan) return [];

    const result: Section[] = [];

    // Summary
    result.push({
      key: 'summary',
      title: 'Overzicht',
      data: [{ type: 'summary' as const, plan, route }],
    });

    // Physical store visits
    for (const visit of plan.storeVisits) {
      const sectionKey = `store-${visit.supermarket.id}`;
      const isCollapsed = collapsedSections.has(sectionKey);
      result.push({
        key: sectionKey,
        title: visit.supermarket.name,
        color: getSupermarketColor(visit.supermarket.slug),
        subtitle: `${visit.items.length} items - ${formatPrice(visit.storeCost)}`,
        collapsible: true,
        data: isCollapsed ? [] : visit.items.map((item) => ({
          type: 'storeItem' as const,
          groceryName: item.groceryItem.name,
          dealTitle: item.deal.title,
          price: item.deal.discount_price * item.groceryItem.quantity,
          productId: item.deal.id,
          productUrl: item.deal.product_url || null,
          discountLabel: getDiscountLabel(
            item.deal.title,
            item.deal.discount_percentage,
            item.deal.original_price,
            item.deal.discount_price,
          ),
          originalPrice: item.deal.original_price,
        })),
      });
    }

    // Online store visits
    for (const visit of plan.onlineStoreVisits) {
      const sectionKey = `online-${visit.supermarket.id}`;
      const isCollapsed = collapsedSections.has(sectionKey);
      result.push({
        key: sectionKey,
        title: `${visit.supermarket.name} (online)`,
        color: getSupermarketColor(visit.supermarket.slug),
        subtitle: `${visit.items.length} items - ${formatPrice(visit.storeCost)}`,
        collapsible: true,
        data: isCollapsed ? [] : visit.items.map((item) => ({
          type: 'storeItem' as const,
          groceryName: item.groceryItem.name,
          dealTitle: item.deal.title,
          price: item.deal.discount_price * item.groceryItem.quantity,
          productId: item.deal.id,
          productUrl: item.deal.product_url || null,
          discountLabel: getDiscountLabel(
            item.deal.title,
            item.deal.discount_percentage,
            item.deal.original_price,
            item.deal.discount_price,
          ),
          originalPrice: item.deal.original_price,
        })),
      });
    }

    // Unmatched items
    if (plan.unmatchedItems.length > 0) {
      const sectionKey = 'unmatched';
      const isCollapsed = collapsedSections.has(sectionKey);
      result.push({
        key: sectionKey,
        title: 'Geen aanbieding gevonden',
        collapsible: true,
        data: isCollapsed ? [] : plan.unmatchedItems.map((item) => ({
          type: 'unmatched' as const,
          name: item.name,
        })),
      });
    }

    // Route section
    if (route && route.stops.length > 0) {
      result.push({
        key: 'route',
        title: 'Route',
        data: [
          ...route.stops.map((stop) => ({
            type: 'routeStop' as const,
            storeName: stop.store.name,
            address: stop.store.address,
            distance: Math.round(stop.distanceFromPrevious * 10) / 10,
          })),
          {
            type: 'routeAction' as const,
            googleMapsUrl: route.googleMapsUrl,
            totalDistance: route.totalDistance,
          },
        ],
      });
    }

    return result;
  }, [plan, route, collapsedSections]);

  const renderSectionHeader = ({ section }: { section: Section }) => {
    const isCollapsed = collapsedSections.has(section.key);
    const isCollapsible = section.collapsible;

    const content = (
      <View style={[
        styles.sectionHeader,
        section.color ? { borderLeftColor: section.color, borderLeftWidth: 4 } : null,
      ]}>
        <View style={styles.sectionHeaderContent}>
          <View style={styles.sectionHeaderText}>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              {section.title}
            </Text>
            {section.subtitle && (
              <Text variant="bodySmall" style={styles.sectionSubtitle}>
                {section.subtitle}
              </Text>
            )}
          </View>
          {isCollapsible && (
            <MaterialCommunityIcons
              name={isCollapsed ? 'chevron-down' : 'chevron-up'}
              size={22}
              color="#666"
            />
          )}
        </View>
      </View>
    );

    if (isCollapsible) {
      return (
        <Pressable onPress={() => toggleSection(section.key)}>
          {content}
        </Pressable>
      );
    }
    return content;
  };

  const renderItem = ({ item }: { item: SectionData }) => {
    switch (item.type) {
      case 'summary':
        return (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <MaterialCommunityIcons name="cart" size={24} color="#0066CC" />
                  <Text variant="headlineSmall" style={styles.summaryValue}>
                    {item.plan.matchedItems}/{item.plan.totalItems}
                  </Text>
                  <Text variant="bodySmall" style={styles.summaryLabel}>items gevonden</Text>
                </View>
                <View style={styles.summaryItem}>
                  <MaterialCommunityIcons name="cash" size={24} color="#00A86B" />
                  <Text variant="headlineSmall" style={styles.summaryValue}>
                    {formatPrice(item.plan.totalCost)}
                  </Text>
                  <Text variant="bodySmall" style={styles.summaryLabel}>totaal</Text>
                </View>
                <View style={styles.summaryItem}>
                  <MaterialCommunityIcons name="piggy-bank" size={24} color="#E74C3C" />
                  <Text variant="headlineSmall" style={[styles.summaryValue, { color: '#00A86B' }]}>
                    {formatPrice(item.plan.totalSavings)}
                  </Text>
                  <Text variant="bodySmall" style={styles.summaryLabel}>bespaard</Text>
                </View>
              </View>
              {item.route && item.route.stops.length > 0 && (
                <View style={styles.routeSummary}>
                  <MaterialCommunityIcons name="map-marker-distance" size={16} color="#666" />
                  <Text variant="bodySmall" style={styles.routeSummaryText}>
                    {item.route.stops.length} winkels - {item.route.totalDistance} km
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
        );

      case 'storeItem':
        return (
          <Pressable
            style={styles.storeItemRow}
            onPress={() => {
              if (item.productUrl) Linking.openURL(item.productUrl);
            }}
            disabled={!item.productUrl}
          >
            <View style={styles.storeItemInfo}>
              <Text variant="bodyMedium" style={styles.storeItemGrocery}>
                {item.groceryName}
              </Text>
              <Text variant="bodySmall" style={styles.storeItemDeal} numberOfLines={2}>
                {item.dealTitle}
              </Text>
              <View style={styles.storeItemMeta}>
                {item.discountLabel && (
                  <Chip
                    compact
                    style={styles.discountChip}
                    textStyle={styles.discountChipText}
                  >
                    {item.discountLabel}
                  </Chip>
                )}
                {item.productUrl && (
                  <View style={styles.linkIndicator}>
                    <MaterialCommunityIcons name="open-in-new" size={12} color="#0066CC" />
                    <Text variant="labelSmall" style={styles.linkText}>Bekijk</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.storeItemPriceContainer}>
              {item.originalPrice != null && item.originalPrice > item.price && (
                <Text variant="bodySmall" style={styles.originalPrice}>
                  {formatPrice(item.originalPrice)}
                </Text>
              )}
              <Text variant="bodyMedium" style={styles.storeItemPrice}>
                {formatPrice(item.price)}
              </Text>
            </View>
          </Pressable>
        );

      case 'unmatched':
        return (
          <View style={styles.unmatchedRow}>
            <MaterialCommunityIcons name="help-circle-outline" size={18} color="#999" />
            <Text variant="bodyMedium" style={styles.unmatchedText}>
              {item.name}
            </Text>
          </View>
        );

      case 'routeStop':
        return (
          <View style={styles.routeStopRow}>
            <MaterialCommunityIcons name="store" size={20} color="#0066CC" />
            <View style={styles.routeStopInfo}>
              <Text variant="bodyMedium">{item.storeName}</Text>
              <Text variant="bodySmall" style={styles.routeStopAddress}>
                {item.address}
              </Text>
            </View>
            <Chip compact style={styles.distanceChip}>
              {item.distance} km
            </Chip>
          </View>
        );

      case 'routeAction':
        return (
          <View style={styles.routeActionContainer}>
            <Divider style={styles.routeDivider} />
            <Text variant="bodySmall" style={styles.totalDistance}>
              Totale afstand: {item.totalDistance} km (retour)
            </Text>
            <Button
              mode="contained"
              icon="google-maps"
              onPress={() => Linking.openURL(item.googleMapsUrl)}
              style={styles.mapsButton}
            >
              Open route in Google Maps
            </Button>
          </View>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Winkelplan" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text variant="bodyLarge" style={styles.loadingText}>
            Aanbiedingen zoeken...
          </Text>
          <Text variant="bodySmall" style={styles.loadingSubtext}>
            {uncheckedItems.length} items worden gematcht met actuele deals
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Winkelplan" />
        </Appbar.Header>
        <EmptyState
          icon="alert-circle-outline"
          title="Fout"
          message={error}
          actionLabel="Opnieuw proberen"
          onAction={() => setLoading(true)}
        />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Winkelplan" />
        </Appbar.Header>
        <EmptyState
          icon="cart-off"
          title="Geen items"
          message="Voeg items toe aan je boodschappenlijst om een winkelplan te maken."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Winkelplan" />
      </Appbar.Header>

      <SectionList
        sections={sections}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${item.type}-${index}`}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 8,
    color: '#666',
    textAlign: 'center',
  },
  // Section headers (collapsible)
  sectionHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  sectionSubtitle: {
    color: '#666',
    marginTop: 2,
  },
  // Summary card
  summaryCard: {
    margin: 12,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontWeight: 'bold',
    marginTop: 4,
  },
  summaryLabel: {
    color: '#666',
    marginTop: 2,
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  routeSummaryText: {
    color: '#666',
    marginLeft: 6,
  },
  // Store items (tappable)
  storeItemRow: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  storeItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  storeItemGrocery: {
    fontWeight: '600',
  },
  storeItemDeal: {
    color: '#666',
    marginTop: 2,
  },
  storeItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  discountChip: {
    backgroundColor: '#FFF3E0',
    height: 24,
  },
  discountChipText: {
    fontSize: 11,
    color: '#E65100',
  },
  linkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  linkText: {
    color: '#0066CC',
    fontSize: 11,
  },
  storeItemPriceContainer: {
    alignItems: 'flex-end',
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
    fontSize: 12,
  },
  storeItemPrice: {
    fontWeight: 'bold',
    color: '#E74C3C',
  },
  // Unmatched
  unmatchedRow: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  unmatchedText: {
    color: '#999',
    marginLeft: 8,
  },
  // Route
  routeStopRow: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  routeStopInfo: {
    flex: 1,
    marginLeft: 12,
  },
  routeStopAddress: {
    color: '#666',
    marginTop: 2,
  },
  distanceChip: {
    height: 26,
  },
  routeActionContainer: {
    backgroundColor: '#fff',
    padding: 16,
  },
  routeDivider: {
    marginBottom: 12,
  },
  totalDistance: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  mapsButton: {
    backgroundColor: '#0066CC',
  },
});
