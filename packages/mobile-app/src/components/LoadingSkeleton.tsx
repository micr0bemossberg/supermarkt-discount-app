/**
 * LoadingSkeleton Component
 * Skeleton placeholder while content is loading
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.imageSkeleton} />
      <View style={styles.content}>
        <View style={[styles.line, styles.titleLine]} />
        <View style={[styles.line, styles.subtitleLine]} />
        <View style={styles.priceRow}>
          <View style={[styles.line, styles.priceLine]} />
          <View style={[styles.line, styles.priceLine]} />
        </View>
      </View>
    </Surface>
  );
};

export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.gridItem}>
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 4,
    marginVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  imageSkeleton: {
    width: '100%',
    height: 120,
    backgroundColor: '#e0e0e0',
  },
  content: {
    padding: 10,
  },
  line: {
    height: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 8,
  },
  titleLine: {
    width: '80%',
    height: 16,
  },
  subtitleLine: {
    width: '60%',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  priceLine: {
    width: 60,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  gridItem: {
    width: '50%',
  },
});
