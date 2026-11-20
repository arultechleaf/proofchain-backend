import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { OrderInfo } from '../../../src/components/OrderInfo';
import { Button, TextField } from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { workerService } from '../../../src/services/worker.service';
import { useAuth } from '../../../src/store/auth.store';
import { spacing } from '../../../src/theme';
import { errorText } from '../../../src/utils/format';
import type { OrderStatus } from '../../../src/types';

type Step = 'packing' | 'ready' | 'out_for_delivery' | 'delivered';
const NEXT: Partial<Record<OrderStatus, { to: Step; label: string }>> = {
  accepted: { to: 'packing', label: 'Start packing' },
  packing: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'out_for_delivery', label: 'Pick up and start delivery' },
  out_for_delivery: { to: 'delivered', label: 'Mark delivered' },
};

export default function LabourOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const me = useAuth((s) => s.user);
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => workerService.order(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const mine = data?.assignedWorkerId === me?.id;
  const unassigned = data && data.assignedWorkerId === null && !['delivered', 'cancelled', 'rejected', 'placed'].includes(data.status);
  const next = data ? NEXT[data.status] : undefined;

  const run = async (fn: () => Promise<NonNullable<typeof data>>) => {
    setBusy(true);
    try { setData(await fn()); setCode(''); } catch (err) { Alert.alert('Order', errorText(err)); } finally { setBusy(false); }
  };
  const advance = () => {
    if (!next) return;
    if (next.to === 'delivered' && !/^\d{4}$/.test(code)) return Alert.alert('Delivery code', "Ask the customer for their 4-digit delivery code and enter it first.");
    void run(() => workerService.setStatus(orderId, next.to, next.to === 'delivered' ? code : undefined));
  };

  return (
    <Screen back title={data?.orderNo ?? 'Order'} loading={loading} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      footer={data && (unassigned || (mine && next)) ? (
        <View style={{ gap: spacing.sm }}>
          {unassigned ? <Button title="Take this order" icon="hand-right-outline" loading={busy} onPress={() => run(() => workerService.claim(orderId))} /> : null}
          {mine && next ? (
            <>
              {next.to === 'delivered' ? (
                <TextField label="Customer's delivery code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="4 digits" />
              ) : null}
              <Button title={next.label} loading={busy} onPress={advance} />
            </>
          ) : null}
        </View>
      ) : undefined}>
      {data ? <OrderInfo order={data} show={['shop', 'customer']} /> : null}
    </Screen>
  );
}
