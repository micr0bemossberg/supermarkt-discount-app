/**
 * CategoryChips Component
 * Wrapping pill layout for filtering by product category
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
      <Text style={styles.label}>Categorie</Text>
      <View style={styles.pillWrap}>
        {/* All categories chip */}
        <Pressable
          onPress={() => handleSelect(null)}
          style={[
            styles.pill,
            selectedId === null && styles.pillAllSelected,
          ]}
        >
          <MaterialCommunityIcons
            name="apps"
            size={11}
            color={selectedId === null ? '#fff' : '#616161'}
          />
          <Text
            style={[
              styles.pillText,
              selectedId === null && styles.pillTextSelected,
            ]}
          >
            Alle
          </Text>
        </Pressable>

        {/* Individual category chips */}
        {categories.map((category) => {
          const isSelected = selectedId === category.id;

          return (
            <Pressable
              key={category.id}
              onPress={() => handleSelect(category.id)}
              style={[
                styles.pill,
                isSelected && styles.pillSelected,
              ]}
            >
              {category.icon_name && (
                <MaterialCommunityIcons
                  name={category.icon_name as any}
                  size={11}
                  color={isSelected ? '#fff' : '#616161'}
                />
              )}
              <Text
                style={[
                  styles.pillText,
                  isSelected && styles.pillTextSelected,
                ]}
                numberOfLines={1}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    paddingHorizontal: 12,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
  },
  pillSelected: {
    backgroundColor: '#0D47A1',
    borderColor: '#0D47A1',
  },
  pillAllSelected: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
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
