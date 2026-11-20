import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { LogoutButton } from '../../src/components/HeaderActions';
import { ProductImage } from '../../src/components/ProductCard';
import { Card, EmptyState, Pill, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useDebounce } from '../../src/hooks/useDebounce';
import { adminService } from '../../src/services/admin.service';
import { colors, font, spacing } from '../../src/theme';
import { money } from '../../src/utils/format';

export default function AdminProducts() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => adminService.products(dq.trim() || undefined), [dq]);
  return (
    <Screen tabScreen title="All products" subtitle={data ? `${data.length} shown` : undefined} right={<LogoutButton />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <TextField icon="search-outline" value={q} onChangeText={setQ} placeholder="Search by name, brand or barcode" />
      {loading && !data ? null : !data?.length ? <EmptyState icon="cube-outline" title="No products found" /> : data.map((p) => (
        <Card key={p.id} style={s.row}>
          <ProductImage uri={p.imageUrl} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{p.name}{p.nameTa ? ` · ${p.nameTa}` : ''}</Text>
            <Text style={s.muted}>{p.shopName} · {money(p.price)} / {p.unit}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <Pill text={`Stock ${p.stock}`} tone={p.stock <= 0 ? 'danger' : 'info'} />
              {p.isActive === false ? <Pill text="Hidden" tone="warning" /> : null}
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  name: { fontSize: font.md, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
});
