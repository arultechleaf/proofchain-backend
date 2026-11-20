import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCart } from '../store/cart.store';
import { colors, font, radius, spacing } from '../theme';
import { money } from '../utils/format';

/** The green "View cart" bar at the bottom of the shopping screens; hidden when the cart is empty. */
export function CartBar() {
  const router = useRouter();
  const cart = useCart((s) => s.cart);
  if (!cart.itemCount) return null;
  return (
    <Pressable onPress={() => router.push('/(customer)/cart' as never)} style={s.bar}>
      <View style={s.count}><Text style={s.countText}>{cart.itemCount}</Text></View>
      <Text style={s.title}>View cart</Text>
      <Text style={s.total}>{money(cart.total)}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.white} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  count: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { color: colors.primary, fontWeight: '800', fontSize: font.sm },
  title: { flex: 1, color: colors.white, fontWeight: '800', fontSize: font.md },
  total: { color: colors.white, fontWeight: '800', fontSize: font.md },
});
