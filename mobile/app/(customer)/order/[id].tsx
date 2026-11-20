import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { OrderInfo } from '../../../src/components/OrderInfo';
import { RepeatOrderButton } from '../../../src/components/RepeatOrderButton';
import { Button, Card, SectionTitle } from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { customerService } from '../../../src/services/customer.service';
import { colors, font, spacing } from '../../../src/theme';
import { errorText } from '../../../src/utils/format';

export default function CustomerOrder() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => customerService.order(orderId), [orderId]);
  const [busy, setBusy] = useState(false);

  const cancel = () => Alert.alert('Cancel order', 'Do you want to cancel this order?', [
    { text: 'No', style: 'cancel' },
    {
      text: 'Yes, cancel', style: 'destructive',
      onPress: async () => {
        setBusy(true);
        try { setData(await customerService.cancelOrder(orderId, 'Cancelled by customer')); } catch (err) { Alert.alert('Order', errorText(err)); } finally { setBusy(false); }
      },
    },
  ]);

  const live = data && !['delivered', 'cancelled', 'rejected'].includes(data.status);
  return (
    <Screen back title={data?.orderNo ?? 'Order'} loading={loading} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {data ? (
        <>
          {live && data.deliveryCode ? (
            <Card style={s.code}>
              <Text style={s.codeLabel}>Delivery code</Text>
              <Text style={s.codeValue}>{data.deliveryCode}</Text>
              <Text style={s.codeHint}>Tell this code to the delivery person only when you receive your order.</Text>
            </Card>
          ) : null}
          <OrderInfo order={data} show={['shop', 'worker']} />
          {['placed', 'accepted'].includes(data.status) ? <Button variant="danger" title="Cancel order" onPress={cancel} loading={busy} style={{ marginTop: spacing.lg }} /> : null}
          {['delivered', 'cancelled', 'rejected'].includes(data.status) ? <View style={{ marginTop: spacing.lg }}><RepeatOrderButton order={data} /></View> : null}
          {data.status === 'delivered' ? (
            <>
              <SectionTitle title="Enjoyed it?" />
              {data.items.map((i) => (
                <Button key={i.id} variant="outline" small title={`Rate ${i.name}`} style={{ marginBottom: spacing.sm }}
                  onPress={() => router.push({ pathname: '/(customer)/product/[id]', params: { id: String(i.productId) } } as never)} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  code: { backgroundColor: colors.primaryLight, alignItems: 'center', marginBottom: spacing.md },
  codeLabel: { fontSize: font.sm, color: colors.primaryDark, fontWeight: '700' },
  codeValue: { fontSize: 38, fontWeight: '900', letterSpacing: 8, color: colors.primaryDark, marginVertical: 4 },
  codeHint: { fontSize: font.sm, color: colors.primaryDark, textAlign: 'center' },
});
