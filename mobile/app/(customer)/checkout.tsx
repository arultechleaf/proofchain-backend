import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button, Card, Chip, EmptyState, ErrorBanner, Row, SectionTitle, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { customerService } from '../../src/services/customer.service';
import { useCart } from '../../src/store/cart.store';
import { colors, font, radius, spacing } from '../../src/theme';
import { errorText, money, PAYMENT_LABEL } from '../../src/utils/format';
import type { PaymentMethod } from '../../src/types';

const METHODS: PaymentMethod[] = ['cod', 'upi'];
const SLOTS = ['As soon as possible', '9 AM - 11 AM', '11 AM - 1 PM', '4 PM - 6 PM', '6 PM - 8 PM'];

export default function Checkout() {
  const router = useRouter();
  const cart = useCart((s) => s.cart);
  const refreshCart = useCart((s) => s.refresh);
  const { data: addresses, loading, error, reload } = useApi(() => customerService.addresses(), []);
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const [addressId, setAddressId] = useState<number | undefined>();
  const [slot, setSlot] = useState(SLOTS[0]);
  const [method, setMethod] = useState<PaymentMethod>('cod');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (addressId === undefined && addresses?.length) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
  }, [addresses, addressId]);

  const pickup = fulfillment === 'pickup';
  // collecting at the shop costs no delivery fee
  const total = pickup ? cart.subtotal : cart.total;

  const place = async () => {
    if (!pickup && !addressId) return setProblem('Choose a delivery address');
    setBusy(true); setProblem('');
    try {
      const res = await customerService.checkout({
        addressId: pickup ? undefined : addressId, paymentMethod: method, fulfillment, deliverySlot: slot, notes: notes.trim(),
      });
      await refreshCart();
      router.replace({
        pathname: '/(customer)/order-success',
        params: { orderNos: res.orders.map((o) => o.orderNo).join(','), codes: res.orders.map((o) => o.deliveryCode).join(','), pickup: pickup ? '1' : '0', slot },
      } as never);
    } catch (err) { setProblem(errorText(err, 'Could not place the order')); } finally { setBusy(false); }
  };

  if (!cart.itemCount) {
    return <Screen back title="Checkout"><EmptyState icon="cart-outline" title="Your cart is empty" /></Screen>;
  }

  return (
    <Screen back title="Checkout" error={error} onRetry={reload}
      footer={<View><Row label={`Pay ${PAYMENT_LABEL[method].toLowerCase()}`} value={money(total)} bold /><Button title="Place order" onPress={place} loading={busy} disabled={!pickup && !addressId} /></View>}>
      <ErrorBanner message={problem} />

      <SectionTitle title="How do you want it?" />
      <View style={s.two}>
        {([['delivery', 'bicycle-outline', 'Home delivery'], ['pickup', 'storefront-outline', 'Pickup at shop']] as const).map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => setFulfillment(k)} style={[s.big, fulfillment === k && s.bigOn]}>
            <Ionicons name={icon} size={22} color={fulfillment === k ? colors.white : colors.primary} />
            <Text style={[s.bigText, fulfillment === k && { color: colors.white }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {pickup ? (
        <Card style={{ backgroundColor: colors.primaryLight }}>
          <Text style={s.title}>No delivery charge</Text>
          <Text style={s.muted}>Collect your order from the shop at the time you choose below. Give the code from your order screen when you collect it.</Text>
        </Card>
      ) : (
        <>
          <SectionTitle title="Delivery address" action="Manage" onAction={() => router.push('/(customer)/addresses' as never)} />
          {loading ? null : !addresses?.length ? (
            <EmptyState icon="location-outline" title="Add a delivery address" action={<Button title="Add address" onPress={() => router.push('/(customer)/addresses' as never)} />} />
          ) : addresses.map((a) => (
            <Pressable key={a.id} onPress={() => setAddressId(a.id)} style={[s.option, addressId === a.id && s.optionOn]}>
              <Ionicons name={addressId === a.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{a.label} · {a.fullName}</Text>
                <Text style={s.muted}>{[a.line1, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')}</Text>
                <Text style={s.muted}>{a.phone}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      <SectionTitle title={pickup ? 'Pickup time' : 'Delivery time'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        {SLOTS.map((t) => <Chip key={t} label={t} active={slot === t} onPress={() => setSlot(t)} />)}
      </ScrollView>

      <SectionTitle title="Payment" />
      {METHODS.map((m) => (
        <Pressable key={m} onPress={() => setMethod(m)} style={[s.option, method === m && s.optionOn]}>
          <Ionicons name={method === m ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
          <Text style={s.title}>{m === 'cod' ? (pickup ? 'Pay at the shop (cash)' : 'Cash on delivery') : 'UPI'}</Text>
        </Pressable>
      ))}
      <Text style={s.muted}>The shop confirms payment when you receive your order.</Text>

      <SectionTitle title="Note for the shop (optional)" />
      <TextField value={notes} onChangeText={setNotes} multiline placeholder="Anything the shop should know" maxLength={300} />

      <SectionTitle title="Summary" />
      <Card>
        {cart.groups.map((g) => <Row key={g.shop.id} label={`${g.shop.name} (${g.items.length})`} value={money(g.subtotal)} />)}
        <Row label="Delivery" value={pickup || !cart.deliveryFee ? 'Free' : money(cart.deliveryFee)} />
        <Row label="Total" value={money(total)} bold />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  two: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  big: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.white },
  bigOn: { backgroundColor: colors.primary },
  bigText: { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, marginBottom: spacing.sm },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  title: { fontSize: font.md, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
});
