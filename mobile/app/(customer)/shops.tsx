import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { Card, EmptyState, Pill, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useDebounce } from '../../src/hooks/useDebounce';
import { customerService } from '../../src/services/customer.service';
import { CartBar } from '../../src/components/CartBar';
import { useCart } from '../../src/store/cart.store';
import { useShopChoice } from '../../src/store/shop.store';
import { colors, font, spacing } from '../../src/theme';
import { money } from '../../src/utils/format';

export default function Shops() {
  const router = useRouter();
  const chosen = useShopChoice((st) => st.shop);
  const choose = useShopChoice((st) => st.choose);
  const cartCount = useCart((st) => st.cart.itemCount);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const { data, loading, error, reload, refresh, refreshing } = useApi(
    () => {
      const t = dq.trim();
      return customerService.shops(/^\d{6}$/.test(t) ? { pincode: t } : { q: t || undefined });
    },
    [dq],
  );

  return (
    <Screen
      tabScreen title="Shops near you" subtitle="Your order goes only to the shop you choose"
      footer={cartCount ? <CartBar /> : undefined}
      right={<HeaderRight notificationsHref="/(customer)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
    >
      <TextField icon="search-outline" value={q} onChangeText={setQ} placeholder="Shop name or pincode" />
      {loading ? null : !data?.length ? <EmptyState icon="storefront-outline" title="No shops found" /> : data.map((shop) => (
        <Card key={shop.id} style={[{ marginBottom: spacing.md }, chosen?.id === shop.id && { borderWidth: 2, borderColor: colors.primary }]}
          onPress={() => { choose({ id: shop.id, name: shop.name }); router.push('/(customer)/home' as never); }}>
          <View style={s.top}>
            <View style={s.logo}><Ionicons name="storefront" size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{shop.name}</Text>
              <Text style={s.muted} numberOfLines={1}>{[shop.address, shop.city, shop.pincode].filter(Boolean).join(', ') || 'Address not added'}</Text>
            </View>
            {chosen?.id === shop.id
              ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              : <Pill text={shop.isOpen ? 'Open' : 'Closed'} tone={shop.isOpen ? 'success' : 'danger'} />}
          </View>
          <Text style={[s.muted, { marginTop: spacing.sm }]}>
            Delivery {shop.deliveryFee ? money(shop.deliveryFee) : 'free'}
            {shop.freeDeliveryAbove ? ` · free above ${money(shop.freeDeliveryAbove)}` : ''}
            {shop.minOrder ? ` · min order ${money(shop.minOrder)}` : ''}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
});
