/**
 * CategoryChips Component
 * Horizontal scrollable chips for filtering by category
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Chip } from 'react-native-paper';
import { getCategories } from '../services/supermarkets';
import type { Category } from '@supermarkt-deals/shared';

interface CategoryChipsProps {
  selectedId: string | null;
  onSelectionChange: (id: string | null) => void;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  selectedId,
  onSelectionChange,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (categoryId: string | null) => {
    if (selectedId === categoryId) {
      // Deselect if already selected
      onSelectionChange(null);
    } else {
      onSelectionChange(categoryId);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All categories chip */}
        <Chip
          selected={selectedId === null}
          onPress={() => handleSelect(null)}
          style={[styles.chip, selectedId === null && styles.chipSelected]}
          textStyle={selectedId === null ? styles.chipTextSelected : undefined}
          icon="apps"
        >
          Alle
        </Chip>

        {/* Individual category chips */}
        {categories.map((category) => {
          const isSelected = selectedId === category.id;

          return (
            <Chip
              key={category.id}
              selected={isSelected}
              onPress={() => handleSelect(category.id)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              textStyle={isSelected ? styles.chipTextSelected : undefined}
              icon={category.icon_name || undefined}
            >
              {category.name}
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
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    marginVertical: 0,
  },
  chipSelected: {
    backgroundColor: '#00A86B',
  },
  chipTextSelected: {
    color: '#fff',
  },
});
