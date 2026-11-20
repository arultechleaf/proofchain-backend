import React, { useState } from 'react';
import { Linking, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/components/Screen';
import { ProductGrid } from '../../../src/components/ProductGrid';
import { Button, Card, Pill, TextField } from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { useDebounce } from '../../../src/hooks/useDebounce';
import { customerService } from '../../../src/services/customer.service';
import { colors, font, spacing } from '../../../src/theme';
import { money } from '../../../src/utils/format';

export default function ShopPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shopId = Number(id);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const shops = useApi(() => customerService.shops(), []);
  const prods = useApi(() => customerService.products({ shopId, q: dq.trim() || undefined, limit: 60 }), [shopId, dq]);
  const shop = shops.data?.find((x) => x.id === shopId);

  return (
    <Screen
      back title={shop?.name ?? 'Shop'} subtitle={shop?.city ?? undefined}
      error={prods.error} onRetry={prods.reload} onRefresh={prods.refresh} refreshing={prods.refreshing}
    >
      {shop ? (
        <Card style={{ marginBottom: spacing.md }}>
          <Pill text={shop.isOpen ? 'Open now' : 'Closed'} tone={shop.isOpen ? 'success' : 'danger'} />
          <Text style={{ color: colors.textMuted, fontSize: font.sm, marginTop: spacing.sm }}>
            {[shop.address, shop.city, shop.pincode].filter(Boolean).join(', ')}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.sm, marginTop: 4 }}>
            Delivery {shop.deliveryFee ? money(shop.deliveryFee) : 'free'}
            {shop.freeDeliveryAbove ? ` · free above ${money(shop.freeDeliveryAbove)}` : ''}
            {shop.minOrder ? ` · min order ${money(shop.minOrder)}` : ''}
          </Text>
          {shop.phone ? <Button small variant="outline" icon="call-outline" title={`Call ${shop.phone}`} style={{ marginTop: spacing.md, alignSelf: 'flex-start' }} onPress={() => void Linking.openURL(`tel:${shop.phone}`)} /> : null}
        </Card>
      ) : null}
      <TextField icon="search-outline" value={q} onChangeText={setQ} placeholder="Search in this shop" />
      {prods.loading ? null : <ProductGrid products={prods.data?.data ?? []} emptyTitle="Nothing here yet" emptyHint="This shop has not added products." />}
    </Screen>
  );
}
