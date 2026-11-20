import React, { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { ProductImage } from '../../src/components/ProductCard';
import { Button, Card, EmptyState, QtyStepper, Row } from '../../src/components/ui';
import { useCart } from '../../src/store/cart.store';
import { colors, font, spacing } from '../../src/theme';
import { errorText, money } from '../../src/utils/format';

export default function CartScreen() {
  const router = useRouter();
  const { cart, loading, refresh, setQuantity, clear } = useCart();
  useFocusEffect(useCallback(() => { void refresh().catch(() => undefined); }, [refresh]));

  const change = async (productId: number, q: number, pack: string) => {
    try { await setQuantity(productId, q, pack); } catch (err) { Alert.alert('Cart', errorText(err)); }
  };
  const blocked = cart.groups.some((g) => !g.shop.isOpen || g.subtotal < g.shop.minOrder || g.items.some((i) => !i.available));

  return (
    <Screen
      tabScreen title="My cart" subtitle={cart.itemCount ? `${cart.itemCount} item${cart.itemCount > 1 ? 's' : ''}` : undefined}
      right={cart.itemCount ? <Text style={s.clear} onPress={() => Alert.alert('Clear cart', 'Remove everything from your cart?', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => void clear() },
      ])}>Clear</Text> : undefined}
      onRefresh={() => void refresh()} refreshing={loading && cart.itemCount > 0}
      footer={cart.itemCount ? (
        <View>
          <Row label="Total" value={money(cart.total)} bold />
          <Button title={blocked ? 'Fix the items above to continue' : 'Checkout'} disabled={blocked} onPress={() => router.push('/(customer)/checkout' as never)} />
        </View>
      ) : undefined}
    >
      {!cart.itemCount ? (
        <EmptyState icon="cart-outline" title="Your cart is empty" hint="Add something you like from the Home tab."
          action={<Button title="Start shopping" onPress={() => router.push('/(customer)/home' as never)} />} />
      ) : cart.groups.map((g) => (
        <Card key={g.shop.id} style={{ marginBottom: spacing.md }}>
          <Text style={s.shop}>{g.shop.name}</Text>
          {!g.shop.isOpen ? <Text style={s.warn}>This shop is closed right now.</Text> : null}
          {g.subtotal < g.shop.minOrder ? <Text style={s.warn}>Minimum order {money(g.shop.minOrder)} — add {money(g.shop.minOrder - g.subtotal)} more.</Text> : null}
          {g.items.map((i) => (
            <View key={`${i.productId}-${i.pack}`} style={s.line}>
              <ProductImage uri={i.imageUrl} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={2}>{i.name}</Text>
                <Text style={s.muted}>{i.unit} · {money(i.price)}</Text>
                {!i.available ? <Text style={s.warn}>Only {i.stock} left</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <QtyStepper value={i.quantity} onChange={(n) => change(i.productId, n, i.pack)} max={Math.max(1, Math.min(99, i.stock))} />
                <Text style={s.lineTotal}>{money(i.lineTotal)}</Text>
              </View>
            </View>
          ))}
          <Row label="Subtotal" value={money(g.subtotal)} />
          <Row label="Delivery" value={g.deliveryFee ? money(g.deliveryFee) : 'Free'} />
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  clear: { color: colors.danger, fontWeight: '800' },
  shop: { fontSize: font.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  lineTotal: { fontSize: font.md, fontWeight: '800', color: colors.text },
  warn: { color: colors.danger, fontSize: font.sm, marginBottom: 4 },
});
