/**
 * SupermarketFilter Component
 * Horizontal scrollable chips for filtering by supermarket
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Chip } from 'react-native-paper';
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

  const handleToggle = (supermarketId: string) => {
    if (selectedIds.includes(supermarketId)) {
      // Remove from selection
      onSelectionChange(selectedIds.filter((id) => id !== supermarketId));
    } else {
      // Add to selection
      onSelectionChange([...selectedIds, supermarketId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === supermarkets.length) {
      // Deselect all
      onSelectionChange([]);
    } else {
      // Select all
      onSelectionChange(supermarkets.map((s) => s.id));
    }
  };

  if (loading) {
    return null;
  }

  const allSelected = selectedIds.length === supermarkets.length || selectedIds.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All supermarkets chip */}
        <Chip
          selected={allSelected}
          onPress={handleSelectAll}
          style={[styles.chip, allSelected && styles.chipSelected]}
          textStyle={allSelected ? styles.chipTextSelected : undefined}
        >
          Alle
        </Chip>

        {/* Individual supermarket chips */}
        {supermarkets.map((supermarket) => {
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
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scrollContent: {
    paddingHorizontal: 16,
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
