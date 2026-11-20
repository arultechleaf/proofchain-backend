import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing } from '../theme';
import { dateTime, money, PAYMENT_LABEL } from '../utils/format';
import { Card, StatusBadge } from './ui';
import type { Order } from '../types';

const STEPS = ['placed', 'accepted', 'packing', 'ready', 'out_for_delivery'] as const;

/** Five small bars that fill as the order moves toward delivery. */
function Progress({ status }: { status: Order['status'] }) {
  if (status === 'cancelled' || status === 'rejected') return null;
  const at = status === 'delivered' ? STEPS.length : STEPS.indexOf(status as (typeof STEPS)[number]) + 1;
  return (
    <View style={s.progress}>
      {STEPS.map((k, i) => <View key={k} style={[s.seg, i < at && { backgroundColor: colors.primary }]} />)}
    </View>
  );
}

/** One order in a list: number, status, what was bought and the total. `who` shows the shop or the customer. */
export function OrderCard({ order, onPress, who, footer }: {
  order: Order;
  onPress?: () => void;
  who?: string;
  footer?: React.ReactNode;
}) {
  const summary = order.items.slice(0, 2).map((i) => `${i.quantity}× ${i.name}`).join(', ');
  const more = order.items.length > 2 ? ` +${order.items.length - 2} more` : '';
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={s.top}>
        <Text style={s.no}>{order.orderNo}</Text>
        <StatusBadge status={order.status} />
      </View>
      <Progress status={order.status} />
      {who ? (
        <View style={s.who}>
          <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
          <Text style={s.muted}>{who}</Text>
        </View>
      ) : null}
      <Text style={s.items} numberOfLines={2}>{summary}{more}</Text>
      <View style={s.bottom}>
        <View>
          <Text style={s.muted}>{dateTime(order.placedAt)}</Text>
          <Text style={s.muted}>{PAYMENT_LABEL[order.paymentMethod]} · {order.paymentStatus}</Text>
        </View>
        <Text style={s.total}>{money(order.total)}</Text>
      </View>
      {footer ? <View style={{ marginTop: spacing.md }}>{footer}</View> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 4, marginTop: spacing.sm },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  no: { fontSize: font.md, fontWeight: '800', color: colors.text },
  who: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  items: { fontSize: font.md, color: colors.text, marginTop: spacing.sm },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.sm },
  muted: { fontSize: font.sm, color: colors.textMuted },
  total: { fontSize: font.xl, fontWeight: '800', color: colors.text },
});
