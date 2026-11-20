import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { ProductImage } from '../../src/components/ProductCard';
import { Button, Card, Chip, EmptyState, Pill, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useDebounce } from '../../src/hooks/useDebounce';
import { ownerService } from '../../src/services/owner.service';
import { useEditingProduct } from '../../src/store/editing.store';
import { colors, font, spacing } from '../../src/theme';
import { errorText, money } from '../../src/utils/format';
import type { Product } from '../../src/types';

/** A warning pill when the product is past its date or expires within a week. */
const expiryPill = (date?: string | null) => {
  if (!date) return null;
  const days = Math.ceil((new Date(String(date).slice(0, 10)).getTime() - Date.now()) / 86400000);
  if (days < 0) return <Pill text="Expired" tone="danger" />;
  if (days <= 7) return <Pill text={`Expires in ${days} day${days === 1 ? '' : 's'}`} tone="warning" />;
  return null;
};

export default function OwnerProducts() {
  const router = useRouter();
  const setEditing = useEditingProduct((s) => s.set);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [filter, setFilter] = useState<'low' | 'out' | undefined>();
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(
    () => ownerService.products({ q: dq.trim() || undefined, filter, limit: 100 }), [dq, filter],
  );

  const open = (p: Product | null) => { setEditing(p); router.push('/(shop-owner)/product-form' as never); };
  const stock = async (p: Product, change: number) => {
    try {
      const next = await ownerService.adjustStock(p.id, change);
      if (data) setData({ ...data, data: data.data.map((x) => (x.id === p.id ? { ...x, ...next } : x)) });
    } catch (err) { Alert.alert('Stock', errorText(err)); }
  };
  const remove = (p: Product) => Alert.alert('Delete product', `Delete "${p.name}"? If it has past orders it is hidden instead.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await ownerService.removeProduct(p.id); reload(); } catch (err) { Alert.alert('Product', errorText(err)); } } },
  ]);

  return (
    <Screen tabScreen title="Products" subtitle={data ? `${data.total} items` : undefined} right={<HeaderRight notificationsHref="/(shop-owner)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      footer={<Button title="Add a product" icon="add" onPress={() => open(null)} />}>
      <TextField icon="search-outline" value={q} onChangeText={setQ} placeholder="Search your products" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, flexGrow: 0 }}>
        <Chip label="All" active={!filter} onPress={() => setFilter(undefined)} />
        <Chip label="Low stock" active={filter === 'low'} onPress={() => setFilter('low')} />
        <Chip label="Out of stock" active={filter === 'out'} onPress={() => setFilter('out')} />
      </ScrollView>
      {loading ? null : !data?.data.length ? <EmptyState icon="cube-outline" title="No products" hint="Add your first product to start selling." /> : data.data.map((p) => (
        <Card key={p.id} style={{ marginBottom: spacing.md }}>
          <View style={s.top}>
            <ProductImage uri={p.imageUrl} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={2}>{p.name}{p.nameTa ? ` · ${p.nameTa}` : ''}</Text>
              <Text style={s.muted}>{p.unit} · {money(p.price)}{p.mrp > p.price ? ` (MRP ${money(p.mrp)})` : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {p.isActive === false ? <Pill text="Hidden" tone="warning" /> : null}
                {expiryPill(p.expiryDate)}
                {p.stock <= 0 ? <Pill text="Out of stock" tone="danger" /> : p.lowStockLevel !== undefined && p.stock <= p.lowStockLevel ? <Pill text="Low stock" tone="warning" /> : null}
              </View>
            </View>
          </View>
          <View style={s.bottom}>
            <View style={s.stock}>
              <Button small variant="outline" title="−" onPress={() => stock(p, -1)} disabled={p.stock <= 0} />
              <Text style={s.stockNo}>{p.stock}</Text>
              <Button small variant="outline" title="+" onPress={() => stock(p, 1)} />
              <Button small variant="outline" title="+10" onPress={() => stock(p, 10)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small variant="outline" icon="create-outline" title="Edit" onPress={() => open(p)} />
              <Button small variant="danger" icon="trash-outline" title="" onPress={() => remove(p)} />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', gap: spacing.md },
  name: { fontSize: font.md, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, flexWrap: 'wrap', rowGap: 8 },
  stock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockNo: { minWidth: 32, textAlign: 'center', fontSize: font.lg, fontWeight: '800', color: colors.text },
});
