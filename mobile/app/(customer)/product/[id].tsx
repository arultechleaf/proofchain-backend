import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { ProductImage } from '../../../src/components/ProductCard';
import { Button, Card, Pill, QtyStepper, SectionTitle, Stars, TextField } from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { customerService } from '../../../src/services/customer.service';
import { useCart } from '../../../src/store/cart.store';
import { colors, font, radius, spacing } from '../../../src/theme';
import { discountPercent, errorText, money, shortDate } from '../../../src/utils/format';

export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { data, loading, error, reload, setData } = useApi(() => customerService.product(productId), [productId]);
  const cart = useCart();
  const [packLabel, setPackLabel] = useState('');
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const p = data;
  const packs = p?.packs ?? [];
  // the first pack is chosen at the start; products without packs are sold by their plain unit
  useEffect(() => { if (packs.length && !packs.some((x) => x.label === packLabel)) setPackLabel(packs[0].label); }, [packs, packLabel]);
  const pack = packs.find((x) => x.label === packLabel);
  const unitPrice = pack ? pack.price : p?.price ?? 0;
  const packQty = pack?.qty ?? 1;
  const maxPacks = p ? Math.max(0, Math.min(99, Math.floor(p.stock / packQty))) : 0;
  const inCart = cart.cart.groups.flatMap((g) => g.items).find((i) => i.productId === productId && i.pack === (pack?.label ?? ''))?.quantity ?? 0;
  useEffect(() => { setQty(1); }, [packLabel]);

  const add = async () => {
    setAdding(true);
    try { await cart.add(productId, qty, pack?.label); setQty(1); } catch (err) { Alert.alert('Cart', errorText(err)); } finally { setAdding(false); }
  };
  const submit = async () => {
    if (!rating) return Alert.alert('Review', 'Tap the stars to rate this product.');
    setSending(true);
    try { setData(await customerService.review(productId, rating, comment.trim())); setRating(0); setComment(''); }
    catch (err) { Alert.alert('Review', errorText(err, 'Only customers who received this product can review it.')); }
    finally { setSending(false); }
  };

  const off = p ? discountPercent(p.mrp, p.price) : 0;
  const out = !p || p.stock <= 0 || maxPacks < 1;
  return (
    <Screen back title={p?.name ?? 'Product'} loading={loading} error={error} onRetry={reload}
      footer={p ? (out ? <Text style={s.out}>Out of stock</Text> : (
        <View style={s.bar}>
          <QtyStepper value={qty} min={1} onChange={setQty} max={maxPacks} />
          <View style={{ flex: 1 }}>
            <Button title={`Add to cart · ${money(unitPrice * qty)}`} icon="cart-outline" onPress={add} loading={adding} />
          </View>
        </View>
      )) : undefined}>
      {p ? (
        <>
          <ProductImage uri={p.imageUrl} size="100%" />
          <Text style={s.name}>{p.name}</Text>
          {p.nameTa ? <Text style={[s.name, { marginTop: 0, fontSize: font.lg }]}>{p.nameTa}</Text> : null}
          <Text style={s.muted}>{p.brand ?? ''}</Text>
          <View style={s.metaRow}>
            <Stars value={p.ratingAvg} count={p.ratingCount} />
            <Text style={{ color: out ? colors.danger : colors.success, fontWeight: '700', fontSize: font.sm }}>{out ? 'Out of stock' : 'In stock'}</Text>
          </View>

          {/* the common price: what one whole unit costs; pack prices are listed below it */}
          <View style={s.priceRow}>
            <Text style={s.price}>{money(p.price)}</Text>
            <Text style={s.per}>/ {p.unit}</Text>
            {p.mrp > p.price ? <Text style={s.mrp}>{money(p.mrp)}</Text> : null}
            {off > 0 ? <Pill text={`${off}% OFF`} tone="success" /> : null}
          </View>

          {packs.length ? (
            <>
              <SectionTitle title="Select weight" />
              <View style={s.packs}>
                {packs.map((x) => {
                  const on = x.label === packLabel;
                  const none = Math.floor(p.stock / x.qty) < 1;
                  return (
                    <Pressable key={x.label} disabled={none} onPress={() => setPackLabel(x.label)} style={[s.tile, on && s.tileOn, none && { opacity: 0.4 }]}>
                      <Text style={[s.tileLabel, on && { color: colors.white }]}>{x.label}</Text>
                      <Text style={[s.tilePrice, on && { color: colors.primaryLight }]}>{money(x.price)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {inCart > 0 ? <Text style={s.inCart}>In your cart: {inCart} × {pack?.label ?? p.unit}</Text> : null}
          {p.stock > 0 && p.stock <= 5 ? <Text style={{ color: colors.warning, marginTop: 4 }}>Only {p.stock} {p.unit} left</Text> : null}

          {p.description ? (
            <>
              <SectionTitle title="About this item" />
              <Text style={s.desc}>{p.description}</Text>
            </>
          ) : null}
          {p.shop ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={s.muted}>Sold by</Text>
              <Text style={s.shop}>{p.shop.name}{p.shop.city ? ` · ${p.shop.city}` : ''}</Text>
              <Pill text={p.shop.isOpen ? 'Shop is open' : 'Shop is closed'} tone={p.shop.isOpen ? 'success' : 'danger'} />
            </Card>
          ) : null}

          <SectionTitle title="Reviews" />
          {p.reviews.length ? p.reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <Text style={s.shop}>{r.userName} · {'★'.repeat(r.rating)}</Text>
              {r.comment ? <Text style={{ color: colors.text, marginTop: 2 }}>{r.comment}</Text> : null}
              <Text style={s.muted}>{shortDate(r.createdAt)}</Text>
            </Card>
          )) : <Text style={s.muted}>No reviews yet.</Text>}

          <SectionTitle title="Rate this product" />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={colors.accent} />
              </Pressable>
            ))}
          </View>
          <TextField value={comment} onChangeText={setComment} multiline placeholder="Share your experience (optional)" maxLength={500} />
          <Button title="Submit review" variant="outline" onPress={submit} loading={sending} />
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { fontSize: font.xl, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  muted: { fontSize: font.sm, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  price: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  per: { fontSize: font.md, color: colors.textMuted },
  mrp: { fontSize: font.md, color: colors.textMuted, textDecorationLine: 'line-through' },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { minWidth: 76, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileLabel: { fontSize: font.md, fontWeight: '800', color: colors.text },
  tilePrice: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  inCart: { marginTop: spacing.sm, fontSize: font.sm, fontWeight: '700', color: colors.primary },
  desc: { fontSize: font.md, color: colors.textMuted, lineHeight: 22 },
  shop: { fontSize: font.md, fontWeight: '700', color: colors.text, marginVertical: 2 },
  out: { textAlign: 'center', color: colors.danger, fontWeight: '800', fontSize: font.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
