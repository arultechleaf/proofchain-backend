import React from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { OrderCard } from '../../src/components/OrderCard';
import { EmptyState } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { workerService } from '../../src/services/worker.service';

export default function LabourHistory() {
  const router = useRouter();
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => workerService.history(), []);
  return (
    <Screen tabScreen title="Delivery history" right={<HeaderRight notificationsHref="/(labour)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {loading ? null : !data?.length ? <EmptyState icon="time-outline" title="No deliveries yet" /> : data.map((o) => (
        <OrderCard key={o.id} order={o} who={o.shipName}
          onPress={() => router.push({ pathname: '/(labour)/order/[id]', params: { id: String(o.id) } } as never)} />
      ))}
    </Screen>
  );
}
