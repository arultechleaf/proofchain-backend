import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';
import { dateTime, money, PAYMENT_LABEL } from '../utils/format';
import { OrderTimeline } from './OrderTimeline';
import { Button, Card, Pill, Row, SectionTitle, StatusBadge } from './ui';
import type { OrderDetail } from '../types';

const call = (n?: string | null) => (n ? <Button small variant="outline" icon="call-outline" title={`Call ${n}`} style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => void Linking.openURL(`tel:${n}`)} /> : null);

/** Everything about one order: status, items, totals, address, people involved and the timeline. */
export function OrderInfo({ order, show }: { order: OrderDetail; show: Array<'shop' | 'customer' | 'worker'> }) {
  return (
    <>
      <Card>
        <View style={s.top}>
          <Text style={s.no}>{order.orderNo}</Text>
          <StatusBadge status={order.status} />
        </View>
        <Text style={s.muted}>Placed {dateTime(order.placedAt)}{order.deliveredAt ? ` · Delivered ${dateTime(order.deliveredAt)}` : ''}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm }}>
          <Pill text={PAYMENT_LABEL[order.paymentMethod]} />
          <Pill text={order.paymentStatus} tone={order.paymentStatus === 'paid' ? 'success' : 'warning'} />
        </View>
        {order.cancelReason ? <Text style={[s.muted, { color: colors.danger, marginTop: 6 }]}>Reason: {order.cancelReason}</Text> : null}
      </Card>

      <SectionTitle title="Items" />
      <Card>
        {order.items.map((i) => (
          <Row key={i.id} label={`${i.quantity} × ${i.name} (${i.unit})`} value={money(i.lineTotal)} />
        ))}
        <View style={s.line} />
        <Row label="Subtotal" value={money(order.subtotal)} />
        <Row label="Delivery" value={order.deliveryFee ? money(order.deliveryFee) : 'Free'} />
        <Row label="Total" value={money(order.total)} bold />
      </Card>

      <SectionTitle title={order.fulfillment === 'pickup' ? 'Pickup at the shop' : 'Deliver to'} />
      <Card>
        {order.deliverySlot ? <Pill text={`${order.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}: ${order.deliverySlot}`} /> : null}
        <Text style={[s.strong, order.deliverySlot ? { marginTop: 6 } : null]}>{order.shipName}</Text>
        {order.fulfillment === 'pickup' ? null : <Text style={s.body}>{order.shipAddress}{order.shipPincode ? ` - ${order.shipPincode}` : ''}</Text>}
        {call(order.shipPhone)}
        {order.notes ? <Text style={[s.muted, { marginTop: 6 }]}>Note: {order.notes}</Text> : null}
      </Card>

      {show.includes('shop') && order.shop ? (
        <><SectionTitle title="Shop" /><Card><Text style={s.strong}>{order.shop.name}</Text><Text style={s.body}>{order.shop.address}</Text>{call(order.shop.phone)}</Card></>
      ) : null}
      {show.includes('customer') && order.customer ? (
        <><SectionTitle title="Customer" /><Card><Text style={s.strong}>{order.customer.name}</Text>{call(order.customer.mobile)}</Card></>
      ) : null}
      {show.includes('worker') && order.worker ? (
        <><SectionTitle title="Delivery person" /><Card><Text style={s.strong}>{order.worker.name}</Text>{call(order.worker.mobile)}</Card></>
      ) : null}

      <SectionTitle title="Progress" />
      <Card><OrderTimeline events={order.events} /></Card>
    </>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  no: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  strong: { fontSize: font.md, fontWeight: '800', color: colors.text },
  body: { fontSize: font.md, color: colors.text, marginTop: 2 },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
