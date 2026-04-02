/**
 * SupermarketFilter Component
 * Wrapping pill layout for filtering by supermarket
 * Grouped into "Winkels" (physical) and "Online" sections
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { getSupermarketColor } from '../utils/formatters';
import { getSupermarkets } from '../services/supermarkets';
import type { Supermarket } from '@supermarkt-deals/shared';

interface SupermarketFilterProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export const SupermarketFilter: React.FC<SupermarketFilterProps> = ({
  selectedIds,
  onSelectionChange,
}) => {
  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSupermarkets();
  }, []);

  const loadSupermarkets = async () => {
    try {
      const data = await getSupermarkets();
      setSupermarkets(data);
    } catch (error) {
      console.error('Failed to load supermarkets:', error);
    } finally {
      setLoading(false);
    }
  };

  const stores = useMemo(
    () => supermarkets.filter((s) => !s.is_online_only && !(s as any).is_wholesale),
    [supermarkets]
  );
  const onlineShops = useMemo(
    () => supermarkets.filter((s) => s.is_online_only),
    [supermarkets]
  );
  const wholesale = useMemo(
    () => supermarkets.filter((s) => (s as any).is_wholesale),
    [supermarkets]
  );

  const handleToggle = (supermarketId: string) => {
    if (selectedIds.includes(supermarketId)) {
      onSelectionChange(selectedIds.filter((id) => id !== supermarketId));
    } else {
      onSelectionChange([...selectedIds, supermarketId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === supermarkets.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(supermarkets.map((s) => s.id));
    }
  };

  if (loading) {
    return null;
  }

  const allSelected = selectedIds.length === supermarkets.length || selectedIds.length === 0;

  const renderPill = (supermarket: Supermarket) => {
    const isSelected = selectedIds.includes(supermarket.id);
    const brandColor = getSupermarketColor(supermarket.slug);

    return (
      <Pressable
        key={supermarket.id}
        onPress={() => handleToggle(supermarket.id)}
        style={[
          styles.pill,
          isSelected && { backgroundColor: brandColor, borderColor: brandColor },
        ]}
      >
        {isSelected && (
          <View style={[styles.pillDot, { backgroundColor: '#fff' }]} />
        )}
        <Text
          style={[
            styles.pillText,
            isSelected && styles.pillTextSelected,
          ]}
          numberOfLines={1}
        >
          {supermarket.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Winkels section */}
      <View style={styles.section}>
        <Text style={styles.label}>Winkels</Text>
        <View style={styles.pillWrap}>
          <Pressable
            onPress={handleSelectAll}
            style={[
              styles.pill,
              allSelected && styles.pillAllSelected,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                allSelected && styles.pillTextSelected,
              ]}
            >
              Alle
            </Text>
          </Pressable>
          {stores.map(renderPill)}
        </View>
      </View>

      {/* Online section */}
      {onlineShops.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Online</Text>
          <View style={styles.pillWrap}>
            {onlineShops.map(renderPill)}
          </View>
        </View>
      )}

      {/* Groothandel section (BTW deductible) */}
      {wholesale.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Groothandel (BTW aftrekbaar)</Text>
          <View style={styles.pillWrap}>
            {wholesale.map(renderPill)}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  section: {
    marginBottom: 4,
  },
  label: {
    color: '#9E9E9E',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 4,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pillAllSelected: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  pillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#424242',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
});
