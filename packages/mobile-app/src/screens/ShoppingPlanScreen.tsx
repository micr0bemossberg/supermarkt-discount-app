/**
 * ShoppingPlanScreen
 * Shows optimized shopping plan: items grouped by cheapest supermarket + route
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, SectionList, Linking, ActivityIndicator, Pressable } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function getDiscountLabel(title: string, discountPercentage: number | null, originalPrice: number | null, discountPrice: number): string | null {
  const parenMatch = title.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const label = parenMatch[1];
    if (/gratis|korting|halve prijs|voor\s*€/i.test(label)) {
      return label;
    }
  }

  if (discountPercentage && discountPercentage > 0) {
    return `${discountPercentage}% korting`;
  }

  if (originalPrice && originalPrice > discountPrice) {
    const pct = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
    if (pct > 0) return `${pct}% korting`;
  }

  return null;
}

export const ShoppingPlanScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
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

  const sections: Section[] = useMemo(() => {
    if (!plan) return [];

    const result: Section[] = [];

    result.push({
      key: 'summary',
      title: 'Overzicht',
      data: [{ type: 'summary' as const, plan, route }],
    });

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
      <View style={styles.sectionHeader}>
        {section.color && <View style={[styles.sectionAccent, { backgroundColor: section.color }]} />}
        <View style={styles.sectionHeaderContent}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.subtitle && (
              <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
            )}
          </View>
          {isCollapsible && (
            <MaterialCommunityIcons
              name={isCollapsed ? 'chevron-down' : 'chevron-up'}
              size={22}
              color="#9E9E9E"
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
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIconCircle, { backgroundColor: '#E3F2FD' }]}>
                  <MaterialCommunityIcons name="cart" size={20} color="#0D47A1" />
                </View>
                <Text style={styles.summaryValue}>
                  {item.plan.matchedItems}/{item.plan.totalItems}
                </Text>
                <Text style={styles.summaryLabel}>gevonden</Text>
              </View>
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIconCircle, { backgroundColor: '#E8F5E9' }]}>
                  <MaterialCommunityIcons name="cash" size={20} color="#1B5E20" />
                </View>
                <Text style={styles.summaryValue}>
                  {formatPrice(item.plan.totalCost)}
                </Text>
                <Text style={styles.summaryLabel}>totaal</Text>
              </View>
              <View style={styles.summaryItem}>
                <View style={[styles.summaryIconCircle, { backgroundColor: '#FFF3E0' }]}>
                  <MaterialCommunityIcons name="piggy-bank" size={20} color="#E65100" />
                </View>
                <Text style={[styles.summaryValue, { color: '#1B5E20' }]}>
                  {formatPrice(item.plan.totalSavings)}
                </Text>
                <Text style={styles.summaryLabel}>bespaard</Text>
              </View>
            </View>
            {item.route && item.route.stops.length > 0 && (
              <View style={styles.routeSummary}>
                <MaterialCommunityIcons name="map-marker-distance" size={16} color="#9E9E9E" />
                <Text style={styles.routeSummaryText}>
                  {item.route.stops.length} winkels - {item.route.totalDistance} km
                </Text>
              </View>
            )}
          </View>
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
              <Text style={styles.storeItemGrocery}>{item.groceryName}</Text>
              <Text style={styles.storeItemDeal} numberOfLines={2}>
                {item.dealTitle}
              </Text>
              <View style={styles.storeItemMeta}>
                {item.discountLabel && (
                  <View style={styles.discountPill}>
                    <Text style={styles.discountPillText}>{item.discountLabel}</Text>
                  </View>
                )}
                {item.productUrl && (
                  <View style={styles.linkIndicator}>
                    <MaterialCommunityIcons name="open-in-new" size={12} color="#0D47A1" />
                    <Text style={styles.linkText}>Bekijk</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.storeItemPriceContainer}>
              {item.originalPrice != null && item.originalPrice > item.price && (
                <Text style={styles.originalPrice}>{formatPrice(item.originalPrice)}</Text>
              )}
              <Text style={styles.storeItemPrice}>{formatPrice(item.price)}</Text>
            </View>
          </Pressable>
        );

      case 'unmatched':
        return (
          <View style={styles.unmatchedRow}>
            <MaterialCommunityIcons name="help-circle-outline" size={18} color="#BDBDBD" />
            <Text style={styles.unmatchedText}>{item.name}</Text>
          </View>
        );

      case 'routeStop':
        return (
          <View style={styles.routeStopRow}>
            <View style={styles.routeStopIcon}>
              <MaterialCommunityIcons name="store" size={18} color="#0D47A1" />
            </View>
            <View style={styles.routeStopInfo}>
              <Text style={styles.routeStopName}>{item.storeName}</Text>
              <Text style={styles.routeStopAddress}>{item.address}</Text>
            </View>
            <View style={styles.distancePill}>
              <Text style={styles.distancePillText}>{item.distance} km</Text>
            </View>
          </View>
        );

      case 'routeAction':
        return (
          <View style={styles.routeActionContainer}>
            <Text style={styles.totalDistance}>
              Totale afstand: {item.totalDistance} km (retour)
            </Text>
            <Button
              mode="contained"
              icon="google-maps"
              onPress={() => Linking.openURL(item.googleMapsUrl)}
              style={styles.mapsButton}
              buttonColor="#0D47A1"
              contentStyle={styles.mapsButtonContent}
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
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text style={styles.headerTitle}>Winkelplan</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Aanbiedingen zoeken...</Text>
          <Text style={styles.loadingSubtext}>
            {uncheckedItems.length} items worden gematcht met actuele deals
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text style={styles.headerTitle}>Winkelplan</Text>
        </View>
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
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text style={styles.headerTitle}>Winkelplan</Text>
        </View>
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
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Winkelplan</Text>
      </View>

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
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 8,
    color: '#9E9E9E',
    textAlign: 'center',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginTop: 8,
  },
  sectionAccent: {
    width: 4,
  },
  sectionHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#212529',
  },
  sectionSubtitle: {
    color: '#9E9E9E',
    marginTop: 2,
    fontSize: 12,
  },
  summaryCard: {
    margin: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryValue: {
    fontWeight: '800',
    fontSize: 16,
    color: '#212529',
  },
  summaryLabel: {
    color: '#9E9E9E',
    marginTop: 2,
    fontSize: 11,
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  routeSummaryText: {
    color: '#9E9E9E',
    marginLeft: 6,
    fontSize: 13,
  },
  storeItemRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  storeItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  storeItemGrocery: {
    fontWeight: '700',
    fontSize: 14,
    color: '#212529',
  },
  storeItemDeal: {
    color: '#757575',
    marginTop: 2,
    fontSize: 13,
  },
  storeItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  discountPill: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  discountPillText: {
    fontSize: 11,
    color: '#E65100',
    fontWeight: '600',
  },
  linkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  linkText: {
    color: '#0D47A1',
    fontSize: 11,
    fontWeight: '600',
  },
  storeItemPriceContainer: {
    alignItems: 'flex-end',
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#BDBDBD',
    fontSize: 12,
  },
  storeItemPrice: {
    fontWeight: '800',
    color: '#1B5E20',
    fontSize: 15,
  },
  unmatchedRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  unmatchedText: {
    color: '#BDBDBD',
    marginLeft: 8,
    fontSize: 14,
  },
  routeStopRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  routeStopIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeStopInfo: {
    flex: 1,
    marginLeft: 12,
  },
  routeStopName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#212529',
  },
  routeStopAddress: {
    color: '#9E9E9E',
    marginTop: 2,
    fontSize: 12,
  },
  distancePill: {
    backgroundColor: '#F1F3F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distancePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
  },
  routeActionContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  totalDistance: {
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 13,
  },
  mapsButton: {
    borderRadius: 12,
  },
  mapsButtonContent: {
    paddingVertical: 4,
  },
});
