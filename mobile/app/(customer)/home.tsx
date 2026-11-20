import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { Logo } from '../../src/components/Logo';
import { HeaderRight } from '../../src/components/HeaderActions';
import { ProductGrid } from '../../src/components/ProductGrid';
import { Chip, SectionTitle, TextField } from '../../src/components/ui';
import { CartBar } from '../../src/components/CartBar';
import { useCart } from '../../src/store/cart.store';
import { useShopChoice } from '../../src/store/shop.store';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProductCard } from '../../src/components/ProductCard';
import { discountPercent } from '../../src/utils/format';
import { useApi } from '../../src/hooks/useApi';
import { useDebounce } from '../../src/hooks/useDebounce';
import { customerService, ProductFilter } from '../../src/services/customer.service';
import { colors, font, radius, spacing } from '../../src/theme';

const SORTS: Array<[NonNullable<ProductFilter['sort']>, string]> = [
  ['new', 'Newest'], ['price_asc', 'Price: low'], ['price_desc', 'Price: high'], ['rating', 'Top rated'],
];

export default function Home() {
  const router = useRouter();
  const shop = useShopChoice((s) => s.shop);
  const choose = useShopChoice((s) => s.choose);
  const cartCount = useCart((s) => s.cart.itemCount);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [sort, setSort] = useState<NonNullable<ProductFilter['sort']>>('new');

  const cats = useApi(() => customerService.categories(), []);
  const prods = useApi(() => customerService.products({ q: dq.trim() || undefined, categoryId, shopId: shop?.id, sort, limit: 40 }), [dq, categoryId, sort, shop?.id]);

  const items = prods.data?.data ?? [];
  // the best discounts first; shown only when nobody is searching or filtering
  const deals = items
    .filter((p) => p.stock > 0 && discountPercent(p.mrp, p.price) > 0)
    .sort((a, b) => discountPercent(b.mrp, b.price) - discountPercent(a.mrp, a.price))
    .slice(0, 8);
  const browsing = !dq.trim() && categoryId === undefined;

  return (
    <Screen
      tabScreen titleNode={<Logo size={44} />}
      right={<HeaderRight notificationsHref="/(customer)/notifications" />}
      error={prods.error} onRetry={prods.reload} onRefresh={prods.refresh} refreshing={prods.refreshing}
      footer={cartCount ? <CartBar /> : undefined}
    >
      <TextField icon="search-outline" value={q} onChangeText={setQ} placeholder="Search groceries, snacks, household…" returnKeyType="search" />
      <View style={s.from}>
        <Ionicons name="storefront-outline" size={16} color={colors.primary} />
        <Text style={s.fromText} numberOfLines={1}>
          {shop ? 'Ordering from ' : 'Showing products from all open shops'}
          {shop ? <Text style={{ fontWeight: '800', color: colors.text }}>{shop.name}</Text> : null}
        </Text>
        <Text style={s.change} onPress={() => { if (shop) choose(null); router.navigate('/(customer)/shops' as never); }}>
          {shop ? 'Change' : 'Choose a shop'}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}>
        <Chip label="All" active={categoryId === undefined} onPress={() => setCategoryId(undefined)} />
        {(cats.data ?? []).map((c) => (
          <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}>
        {SORTS.map(([k, label]) => <Chip key={k} label={label} active={sort === k} onPress={() => setSort(k)} />)}
      </ScrollView>
      {browsing && deals.length ? (
        <>
          <View style={s.banner}>
            <Text style={s.bannerTitle}>Today's deals</Text>
            <Text style={s.bannerText}>Save up to {discountPercent(deals[0].mrp, deals[0].price)}% on groceries from shops near you</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.md }}>
            {deals.map((p) => <View key={p.id} style={{ width: 170, marginRight: spacing.md }}><View style={{ width: '100%' }}><ProductCard product={p} fill /></View></View>)}
          </ScrollView>
          <SectionTitle title="All products" />
        </>
      ) : null}
      <View style={{ minHeight: 120 }}>
        {prods.loading ? null : <ProductGrid products={items} />}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { marginBottom: spacing.md, flexGrow: 0 },
  from: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  fromText: { flex: 1, color: colors.textMuted, fontSize: font.sm },
  change: { color: colors.primary, fontWeight: '800', fontSize: font.sm },
  banner: { backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  bannerTitle: { color: colors.primary, fontSize: font.xl, fontWeight: '900' },
  bannerText: { color: colors.textMuted, fontSize: font.sm, marginTop: 4 },
});
