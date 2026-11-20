import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Logo } from '../../src/components/Logo';
import { HeaderRight } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { ProductImage } from '../../src/components/ProductCard';
import { Card, Pill, SectionTitle, StatTile } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { adminService } from '../../src/services/admin.service';
import { useAuth } from '../../src/store/auth.store';
import { colors, font, spacing } from '../../src/theme';
import { money } from '../../src/utils/format';

export default function AdminOverview() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const overview = useApi(() => adminService.overview(), []);
  const shops = useApi(() => adminService.shops(), []);
  const products = useApi(() => adminService.products(), []);
  const orders = useApi(() => adminService.orders(), []);
  const { data, loading, error, reload } = overview;
  const go = (path: string) => () => router.navigate(path as never);
  const refreshAll = () => { overview.refresh(); shops.refresh(); products.refresh(); orders.refresh(); };
  const refreshing = overview.refreshing || shops.refreshing || products.refreshing || orders.refreshing;

  return (
    <Screen tabScreen titleNode={<Logo size={44} />} subtitle={user?.email} right={<HeaderRight notificationsHref="/(admin)/notifications" />}
      loading={loading && !data} error={error} onRetry={reload} onRefresh={refreshAll} refreshing={refreshing}>
      {data ? (
        <View style={s.grid}>
          <StatTile label="Sales today" value={money(data.salesToday)} icon="cash-outline" />
          <StatTile label="Total sales" value={money(data.sales)} icon="trending-up-outline" />
          <StatTile label="Orders today" value={data.ordersToday} icon="receipt-outline" tone={colors.info} />
          <StatTile label="Active orders" value={data.activeOrders} icon="time-outline" tone={colors.warning} />
          <StatTile label="All orders" value={data.orders} icon="documents-outline" tone={colors.info} />
          <StatTile label="Shops (open)" value={`${data.shops} (${data.openShops})`} icon="storefront-outline" />
          <StatTile label="Products" value={data.products} icon="cube-outline" tone={colors.warning} />
          <StatTile label="Customers" value={data.customers} icon="people-outline" tone={colors.info} />
          <StatTile label="Shop owners" value={data.owners} icon="person-outline" />
          <StatTile label="Delivery staff" value={data.workers} icon="bicycle-outline" tone={colors.info} />
        </View>
      ) : null}

      <View style={s.section}>
        <SectionTitle title="Recent orders" action="See all" onAction={go('/(admin)/orders')} />
        {orders.data?.length ? orders.data.slice(0, 5).map((o) => (
          <OrderCard key={o.id} order={o} who={`${o.shopName ?? ''} → ${o.customerName || o.shipName}`}
            onPress={() => router.navigate(`/(admin)/order/${o.id}` as never)} />
        )) : <Text style={s.empty}>{orders.loading ? 'Loading…' : 'No orders yet'}</Text>}
      </View>

      <View style={s.section}>
        <SectionTitle title="Shops" action="See all" onAction={go('/(admin)/shops')} />
        {shops.data?.length ? shops.data.slice(0, 5).map((shop) => (
          <Card key={shop.id} style={s.card} onPress={go('/(admin)/shops')}>
            <Text style={s.name} numberOfLines={1}>{shop.name}</Text>
            <Text style={s.muted} numberOfLines={1}>Owner: {shop.ownerName}{shop.city ? ` · ${shop.city}` : ''}</Text>
            <View style={s.pills}>
              <Pill text={shop.isActive ? (shop.isOpen ? 'Open' : 'Closed') : 'Blocked'} tone={!shop.isActive ? 'danger' : shop.isOpen ? 'success' : 'warning'} />
              <Pill text={`${shop.productCount} products`} />
              <Pill text={`${shop.orderCount} orders`} />
            </View>
          </Card>
        )) : <Text style={s.empty}>{shops.loading ? 'Loading…' : 'No shops yet'}</Text>}
      </View>

      <View style={s.section}>
        <SectionTitle title="Latest products" action="See all" onAction={go('/(admin)/products')} />
        {products.data?.length ? products.data.slice(0, 6).map((p) => (
          <Card key={p.id} style={[s.card, s.productRow]} onPress={go('/(admin)/products')}>
            <ProductImage uri={p.imageUrl} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{p.name}</Text>
              <Text style={s.muted} numberOfLines={1}>{p.shopName} · {money(p.price)} / {p.unit}</Text>
            </View>
            <Pill text={`Stock ${p.stock}`} tone={p.stock <= 0 ? 'danger' : 'info'} />
          </Card>
        )) : <Text style={s.empty}>{products.loading ? 'Loading…' : 'No products yet'}</Text>}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  section: { marginTop: spacing.lg },
  card: { marginBottom: spacing.sm },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: font.md, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  pills: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  empty: { color: colors.textMuted, fontSize: font.sm, paddingVertical: spacing.sm },
});
