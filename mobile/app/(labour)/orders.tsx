import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { Button, Chip, EmptyState } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { workerService } from '../../src/services/worker.service';
import { spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

export default function LabourOrders() {
  const router = useRouter();
  const [scope, setScope] = useState<'mine' | 'open'>('mine');
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => workerService.orders(scope), [scope]);

  const open = (id: number) => router.push({ pathname: '/(labour)/order/[id]', params: { id: String(id) } } as never);
  const claim = async (id: number) => {
    try { await workerService.claim(id); setScope('mine'); reload(); open(id); } catch (err) { Alert.alert('Order', errorText(err)); }
  };

  return (
    <Screen tabScreen title="Orders" right={<HeaderRight notificationsHref="/(labour)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        <Chip label="Mine" active={scope === 'mine'} onPress={() => setScope('mine')} />
        <Chip label="Open to take" active={scope === 'open'} onPress={() => setScope('open')} />
      </View>
      {loading ? null : !data?.length ? (
        <EmptyState icon="bicycle-outline" title={scope === 'mine' ? 'No orders assigned to you' : 'No open orders right now'}
          hint={scope === 'mine' ? 'Take an order from "Open to take".' : 'Pull down to refresh.'} />
      ) : data.map((o) => (
        <OrderCard key={o.id} order={o} who={o.shipName} onPress={() => open(o.id)}
          footer={scope === 'open' ? <Button small title="Take this order" icon="hand-right-outline" onPress={() => claim(o.id)} /> : undefined} />
      ))}
    </Screen>
  );
}
