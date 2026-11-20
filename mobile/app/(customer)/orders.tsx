import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { RepeatOrderButton } from '../../src/components/RepeatOrderButton';
import { Button, Chip, EmptyState } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { customerService } from '../../src/services/customer.service';
import { spacing } from '../../src/theme';

export default function Orders() {
  const router = useRouter();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => customerService.orders(tab), [tab]);

  return (
    <Screen tabScreen title="My orders" right={<HeaderRight notificationsHref="/(customer)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label="Active" active={tab === 'active'} onPress={() => setTab('active')} />
        <Chip label="Past" active={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      {loading ? null : !data?.length ? (
        <EmptyState icon="receipt-outline" title={tab === 'active' ? 'No active orders' : 'No past orders'}
          action={tab === 'active' ? <Button title="Start shopping" onPress={() => router.push('/(customer)/home' as never)} /> : undefined} />
      ) : data.map((o) => (
        <OrderCard key={o.id} order={o} who={o.shopName} footer={tab === 'past' ? <RepeatOrderButton order={o} small /> : undefined}
          onPress={() => router.push({ pathname: '/(customer)/order/[id]', params: { id: String(o.id) } } as never)} />
      ))}
    </Screen>
  );
}
