import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { Button, Card, StatTile } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService } from '../../src/services/owner.service';
import { colors, font, spacing } from '../../src/theme';
import { errorText, money } from '../../src/utils/format';

export default function OwnerDashboard() {
  const router = useRouter();
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => ownerService.dashboard(), []);
  const [saving, setSaving] = useState(false);

  const toggle = async (isOpen: boolean) => {
    if (!data) return;
    setSaving(true);
    try { await ownerService.updateShop({ isOpen }); setData({ ...data, shop: { ...data.shop, isOpen } }); }
    catch (err) { Alert.alert('Shop', errorText(err)); } finally { setSaving(false); }
  };

  return (
    <Screen tabScreen title={data?.shop.name ?? 'Dashboard'} subtitle="Today at your shop"
      right={<HeaderRight notificationsHref="/(shop-owner)/notifications" />}
      loading={loading && !data} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {data ? (
        <>
          <Card style={s.open}>
            <View style={{ flex: 1 }}>
              <Text style={s.openTitle}>{data.shop.isOpen ? 'Shop is open' : 'Shop is closed'}</Text>
              <Text style={s.muted}>{data.shop.isOpen ? 'Customers can order now.' : 'Customers cannot place orders.'}</Text>
            </View>
            <Switch value={data.shop.isOpen} onValueChange={toggle} disabled={saving} trackColor={{ true: colors.primary }} />
          </Card>

          {data.newOrders > 0 ? (
            <Card style={s.alert} onPress={() => router.push('/(shop-owner)/orders' as never)}>
              <Text style={s.alertText}>🔔 {data.newOrders} new order{data.newOrders > 1 ? 's' : ''} waiting for you</Text>
            </Card>
          ) : null}

          <View style={s.grid}>
            <StatTile label="Sales today" value={money(data.salesToday)} icon="cash-outline" />
            <StatTile label="Orders today" value={data.ordersToday} icon="receipt-outline" tone={colors.info} />
            <StatTile label="Active orders" value={data.activeOrders} icon="time-outline" tone={colors.warning} />
            <StatTile label="Delivered today" value={data.deliveredToday} icon="checkmark-done-outline" />
            <StatTile label="Low stock" value={data.lowStock} icon="alert-circle-outline" tone={colors.warning} />
            <StatTile label="Expiring in 7 days" value={data.expirySoon ?? 0} icon="hourglass-outline" tone={colors.danger} />
            <StatTile label="Out of stock" value={data.outOfStock} icon="close-circle-outline" tone={colors.danger} />
            <StatTile label="Delivery team" value={data.workers} icon="people-outline" tone={colors.info} />
          </View>

          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            <Button title="Add a product" icon="add" onPress={() => router.push('/(shop-owner)/product-form' as never)} />
            <Button title="Sales report" variant="outline" icon="bar-chart-outline" onPress={() => router.push('/(shop-owner)/report' as never)} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  open: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  openTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  alert: { backgroundColor: colors.warningLight, marginBottom: spacing.md },
  alertText: { fontWeight: '800', color: colors.warning, fontSize: font.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
