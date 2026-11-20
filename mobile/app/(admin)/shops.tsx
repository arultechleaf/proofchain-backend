import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { LogoutButton } from '../../src/components/HeaderActions';
import { Card, EmptyState, Pill } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { adminService } from '../../src/services/admin.service';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';
import type { AdminShop } from '../../src/services/admin.service';

export default function AdminShops() {
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => adminService.shops(), []);

  const toggle = (shop: AdminShop, isActive: boolean) => {
    const run = async () => {
      try {
        await adminService.setShopActive(shop.id, isActive);
        if (data) setData(data.map((x) => (x.id === shop.id ? { ...x, isActive } : x)));
      } catch (err) { Alert.alert('Shop', errorText(err)); }
    };
    if (isActive) void run();
    else Alert.alert('Block this shop?', `${shop.name} will disappear from the customers' app until you unblock it.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen tabScreen title="Shops" subtitle={data ? `${data.length} shop${data.length === 1 ? '' : 's'}` : undefined} right={<LogoutButton />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {loading && !data ? null : !data?.length ? <EmptyState icon="storefront-outline" title="No shops yet" hint="Shop owners register from the app." /> : data.map((shop) => (
        <Card key={shop.id} style={{ marginBottom: spacing.md }}>
          <View style={s.top}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{shop.name}</Text>
              <Text style={s.muted}>{[shop.address, shop.city, shop.pincode].filter(Boolean).join(', ') || 'No address'}</Text>
            </View>
            <Switch value={shop.isActive} onValueChange={(v) => toggle(shop, v)} trackColor={{ true: colors.primary }} />
          </View>
          <Text style={[s.muted, { marginTop: spacing.sm }]}>Owner: {shop.ownerName} · {shop.ownerEmail}{shop.ownerMobile ? ` · ${shop.ownerMobile}` : ''}</Text>
          <View style={s.pills}>
            <Pill text={shop.isActive ? (shop.isOpen ? 'Open' : 'Closed') : 'Blocked'} tone={!shop.isActive ? 'danger' : shop.isOpen ? 'success' : 'warning'} />
            <Pill text={`${shop.productCount} products`} />
            <Pill text={`${shop.orderCount} orders`} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  pills: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
});
