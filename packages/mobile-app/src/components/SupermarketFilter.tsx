/**
 * SupermarketFilter Component
 * Horizontal scrollable chips for filtering by supermarket
 * Grouped into "Winkels" (physical stores) and "Online" sections
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Chip, Text } from 'react-native-paper';
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
    () => supermarkets.filter((s) => !s.is_online_only),
    [supermarkets]
  );
  const onlineShops = useMemo(
    () => supermarkets.filter((s) => s.is_online_only),
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

  const renderChip = (supermarket: Supermarket) => {
    const isSelected = selectedIds.includes(supermarket.id);
    return (
      <Chip
        key={supermarket.id}
        selected={isSelected}
        onPress={() => handleToggle(supermarket.id)}
        style={[styles.chip, isSelected && styles.chipSelected]}
        textStyle={isSelected ? styles.chipTextSelected : undefined}
      >
        {supermarket.name}
      </Chip>
    );
  };

  return (
    <View style={styles.container}>
      {/* Winkels row */}
      <View style={styles.row}>
        <Text style={styles.label} variant="labelSmall">Winkels</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Chip
            selected={allSelected}
            onPress={handleSelectAll}
            style={[styles.chip, allSelected && styles.chipSelected]}
            textStyle={allSelected ? styles.chipTextSelected : undefined}
          >
            Alle
          </Chip>
          {stores.map(renderChip)}
        </ScrollView>
      </View>

      {/* Online row */}
      {onlineShops.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.label} variant="labelSmall">Online</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {onlineShops.map(renderChip)}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    paddingLeft: 16,
    minWidth: 52,
    color: '#666',
  },
  scrollContent: {
    paddingRight: 16,
    gap: 8,
  },
  chip: {
    marginVertical: 0,
  },
  chipSelected: {
    backgroundColor: '#0066CC',
  },
  chipTextSelected: {
    color: '#fff',
  },
});
