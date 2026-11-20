import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { LogoutButton } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { Chip, EmptyState } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { adminService } from '../../src/services/admin.service';
import { spacing } from '../../src/theme';

const FILTERS: Array<[string | undefined, string]> = [
  [undefined, 'All'], ['placed', 'New'], ['active', 'Active'], ['out_for_delivery', 'On the way'], ['delivered', 'Delivered'], ['past', 'Past'],
];

export default function AdminOrders() {
  const router = useRouter();
  const [filter, setFilter] = useState<string | undefined>();
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => adminService.orders(filter), [filter]);
  return (
    <Screen tabScreen title="All orders" right={<LogoutButton />} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, flexGrow: 0 }}>
        {FILTERS.map(([k, label]) => <Chip key={label} label={label} active={filter === k} onPress={() => setFilter(k)} />)}
      </ScrollView>
      {loading && !data ? null : !data?.length ? <EmptyState icon="receipt-outline" title="No orders here" /> : data.map((o) => (
        <OrderCard key={o.id} order={o} who={`${o.shopName ?? ''} → ${o.customerName || o.shipName}`}
          onPress={() => router.push({ pathname: '/(admin)/order/[id]', params: { id: String(o.id) } } as never)} />
      ))}
    </Screen>
  );
}
