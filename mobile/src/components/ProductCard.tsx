import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, font, radius, shadow, spacing } from '../theme';
import { discountPercent, errorText, money } from '../utils/format';
import { imageUri } from '../constants/config';
import { useCart } from '../store/cart.store';
import { Alert } from 'react-native';
import { QtyStepper, Stars } from './ui';
import type { Product } from '../types';

export function ProductImage({ uri, size, radiusValue = radius.md }: { uri: string | null; size: number | '100%'; radiusValue?: number }) {
  const box = size === '100%' ? { width: '100%' as const, aspectRatio: 1 } : { width: size, height: size };
  const src = imageUri(uri);
  return src ? (
    <Image source={{ uri: src }} style={[box, { borderRadius: radiusValue, backgroundColor: colors.background }]} contentFit="cover" transition={150} />
  ) : (
    <View style={[box, s.placeholder, { borderRadius: radiusValue }]}>
      <Ionicons name="cube-outline" size={typeof size === 'number' ? size / 2.4 : 40} color={colors.primary} />
    </View>
  );
}

/** A product tile for the grid: photo, price with discount, rating and an Add / quantity control. */
export function ProductCard({ product, fill }: { product: Product; fill?: boolean }) {
  const router = useRouter();
  const cart = useCart();
  const hasPacks = !!product.packs?.length;
  // products sold in packs (250 g, 500 g, 1 kg) are chosen on their own page
  const inCart = cart.cart.groups.flatMap((g) => g.items).find((i) => i.productId === product.id && !i.pack)?.quantity ?? 0;
  const off = discountPercent(product.mrp, product.price);
  const out = product.stock <= 0;
  const from = hasPacks ? Math.min(...(product.packs ?? []).map((p) => p.price)) : product.price;
  const open = () => router.navigate(`/(customer)/product/${product.id}` as never);

  const change = async (q: number) => {
    try {
      if (inCart === 0) await cart.add(product.id, 1);
      else await cart.setQuantity(product.id, q);
    } catch (err) {
      Alert.alert('Cart', errorText(err));
    }
  };

  return (
    <Pressable style={[s.card, fill && { width: '100%' }]} onPress={open}>
      <View>
        <ProductImage uri={product.imageUrl} size="100%" radiusValue={radius.md} />
        {off > 0 ? <View style={s.off}><Text style={s.offText}>{off}% OFF</Text></View> : null}
        {product.ratingCount > 0 ? (
          <View style={s.rate}><Ionicons name="star" size={10} color={colors.accent} /><Text style={s.rateText}>{product.ratingAvg.toFixed(1)}</Text></View>
        ) : null}
      </View>
      <Text style={s.name} numberOfLines={2}>{product.name}</Text>
      {product.nameTa ? <Text style={s.ta} numberOfLines={1}>{product.nameTa}</Text> : null}
      <Text style={s.meta} numberOfLines={1}>{hasPacks ? product.packs!.map((p) => p.label).join(' · ') : product.unit}{product.shopName ? ` · ${product.shopName}` : ''}</Text>
      <Stars value={product.ratingAvg} count={product.ratingCount} />
      <View style={s.priceRow}>
        <Text style={s.price}>{hasPacks ? 'From ' : ''}{money(from)}</Text>
        {!hasPacks && product.mrp > product.price ? <Text style={s.mrp}>{money(product.mrp)}</Text> : null}
      </View>
      <View style={{ marginTop: spacing.sm, alignItems: 'flex-start' }}>
        {out ? (
          <Text style={s.out}>Out of stock</Text>
        ) : hasPacks ? (
          <Pressable onPress={open} style={s.addBtn}><Text style={s.addText}>SELECT</Text></Pressable>
        ) : inCart > 0 ? (
          <QtyStepper value={inCart} onChange={change} max={Math.min(99, Math.floor(product.stock))} />
        ) : (
          <Pressable onPress={() => change(1)} style={s.addBtn}>
            <Text style={s.addText}>ADD</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { width: '48.5%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.md, ...shadow.card },
  placeholder: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  off: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.success, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  offText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  rate: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  rateText: { fontSize: 10, fontWeight: '800', color: colors.text },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: spacing.sm, minHeight: 38 },
  ta: { fontSize: font.sm, color: colors.textMuted, marginTop: -2 },
  meta: { fontSize: font.xs, color: colors.textMuted, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  price: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  mrp: { fontSize: font.sm, color: colors.textMuted, textDecorationLine: 'line-through' },
  out: { color: colors.danger, fontWeight: '700', fontSize: font.sm, paddingVertical: 6 },
  addBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 22, paddingVertical: 6 },
  addText: { color: colors.primary, fontWeight: '800', fontSize: font.sm },
});
