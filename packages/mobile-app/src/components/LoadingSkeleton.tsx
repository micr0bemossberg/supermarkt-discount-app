/**
 * LoadingSkeleton Component
 * Skeleton placeholder while content is loading
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />
      <View style={styles.imageSkeleton} />
      <View style={styles.content}>
        <View style={[styles.line, styles.supermarketLine]} />
        <View style={[styles.line, styles.titleLine]} />
        <View style={[styles.line, styles.titleLine2]} />
        <View style={styles.priceRow}>
          <View style={[styles.line, styles.priceLine]} />
          <View style={[styles.line, styles.priceLineSmall]} />
        </View>
        <View style={[styles.line, styles.validityLine]} />
      </View>
    </View>
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
    marginVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  accentBar: {
    height: 3,
    backgroundColor: '#E0E0E0',
  },
  imageSkeleton: {
    width: '100%',
    height: 130,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 10,
  },
  line: {
    height: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 5,
    marginBottom: 8,
  },
  supermarketLine: {
    width: '35%',
    height: 8,
  },
  titleLine: {
    width: '90%',
    height: 12,
  },
  titleLine2: {
    width: '60%',
    height: 12,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  priceLine: {
    width: 60,
    height: 16,
  },
  priceLineSmall: {
    width: 40,
    height: 10,
    marginTop: 4,
  },
  validityLine: {
    width: '45%',
    height: 8,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  gridItem: {
    width: '50%',
  },
});
