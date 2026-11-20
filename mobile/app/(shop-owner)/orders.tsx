import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { Chip, EmptyState } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService } from '../../src/services/owner.service';
import { spacing } from '../../src/theme';

const FILTERS: Array<[string | undefined, string]> = [
  [undefined, 'All'], ['placed', 'New'], ['active', 'Active'], ['out_for_delivery', 'On the way'], ['past', 'Past'],
];

export default function OwnerOrders() {
  const router = useRouter();
  const [filter, setFilter] = useState<string | undefined>('active');
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => ownerService.orders(filter), [filter]);

  return (
    <Screen tabScreen title="Orders" right={<HeaderRight notificationsHref="/(shop-owner)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md, flexGrow: 0 }}>
        {FILTERS.map(([k, label]) => <Chip key={label} label={label} active={filter === k} onPress={() => setFilter(k)} />)}
      </ScrollView>
      {loading ? null : !data?.length ? <EmptyState icon="receipt-outline" title="No orders here" hint="New orders will appear automatically." /> : data.map((o) => (
        <OrderCard key={o.id} order={o} who={o.shipName}
          onPress={() => router.push({ pathname: '/(shop-owner)/order/[id]', params: { id: String(o.id) } } as never)} />
      ))}
    </Screen>
  );
}
