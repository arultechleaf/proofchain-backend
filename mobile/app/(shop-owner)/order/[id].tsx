import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { OrderInfo } from '../../../src/components/OrderInfo';
import { Button, Chip, SectionTitle, TextField } from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { ownerService } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { errorText } from '../../../src/utils/format';
import type { OrderStatus } from '../../../src/types';

/** What the owner can do next for each status. */
const NEXT: Partial<Record<OrderStatus, Array<{ to: OrderStatus; label: string; variant?: 'primary' | 'danger' | 'outline' }>>> = {
  placed: [{ to: 'accepted', label: 'Accept order' }, { to: 'rejected', label: 'Reject', variant: 'danger' }],
  accepted: [{ to: 'packing', label: 'Start packing' }, { to: 'cancelled', label: 'Cancel', variant: 'danger' }],
  packing: [{ to: 'ready', label: 'Mark ready' }],
  ready: [{ to: 'out_for_delivery', label: 'Out for delivery' }],
  out_for_delivery: [{ to: 'delivered', label: 'Mark delivered' }],
};

export default function OwnerOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => ownerService.order(orderId), [orderId]);
  const workers = useApi(() => ownerService.workers(), []);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const act = async (fn: () => Promise<typeof data>) => {
    setBusy(true);
    try { const next = await fn(); if (next) setData(next); } catch (err) { Alert.alert('Order', errorText(err)); } finally { setBusy(false); }
  };
  const move = (to: OrderStatus) => {
    const bad = to === 'rejected' || to === 'cancelled';
    const run = () => act(() => ownerService.setStatus(orderId, to, bad ? `${to} by shop` : undefined, to === 'delivered' ? code : undefined));
    if (bad) Alert.alert('Are you sure?', `This will mark the order as ${to}.`, [{ text: 'No', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: run }]);
    else if (to === 'delivered' && !/^\d{4}$/.test(code)) Alert.alert('Delivery code', "Enter the customer's 4-digit delivery code first.");
    else void run();
  };

  const actions = data ? NEXT[data.status] ?? [] : [];
  const pickWorker = data && ['accepted', 'packing', 'ready'].includes(data.status);
  return (
    <Screen back title={data?.orderNo ?? 'Order'} loading={loading} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      footer={data && actions.length ? (
        <View style={{ gap: spacing.sm }}>
          {data.status === 'out_for_delivery' ? (
            <TextField label="Customer's delivery code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="4 digits" />
          ) : null}
          {actions.map((a) => <Button key={a.to} title={a.label} variant={a.variant} loading={busy} onPress={() => move(a.to)} />)}
        </View>
      ) : undefined}>
      {data ? (
        <>
          <OrderInfo order={data} show={['customer', 'worker']} />
          {data.paymentStatus !== 'paid' && data.status !== 'cancelled' && data.status !== 'rejected' ? (
            <Button variant="outline" title="Mark payment received" style={{ marginTop: spacing.lg }} loading={busy}
              onPress={() => act(() => ownerService.setPayment(orderId, 'paid'))} />
          ) : null}
          {pickWorker ? (
            <>
              <SectionTitle title="Assign a delivery person" />
              {!workers.data?.length ? <Text style={{ color: colors.textMuted }}>Add team members in the Team tab.</Text> : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                  {workers.data.filter((w) => w.isActive).map((w) => (
                    <Chip key={w.id} label={w.name} active={data.assignedWorkerId === w.id} onPress={() => act(() => ownerService.assign(orderId, w.id))} />
                  ))}
                </View>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
