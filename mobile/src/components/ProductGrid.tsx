import React from 'react';
import { StyleSheet, View } from 'react-native';
import { EmptyState } from './ui';
import { ProductCard } from './ProductCard';
import type { Product } from '../types';

/** Two-column grid of product cards. */
export function ProductGrid({ products, emptyTitle = 'No products found', emptyHint }: {
  products: Product[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (!products.length) return <EmptyState icon="search-outline" title={emptyTitle} hint={emptyHint ?? 'Try a different word or category.'} />;
  return (
    <View style={s.grid}>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </View>
  );
}

const s = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' } });
