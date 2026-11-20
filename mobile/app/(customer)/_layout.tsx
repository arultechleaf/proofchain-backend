import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { tabIcon as icon } from '../../src/components/tabIcon';
import { colors } from '../../src/theme';
import { useCart } from '../../src/store/cart.store';

const hidden = { href: null } as const;

export default function CustomerLayout() {
  const count = useCart((s) => s.cart.itemCount);
  const refresh = useCart((s) => s.refresh);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 } }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="shops" options={{ title: 'Shops', tabBarIcon: icon('storefront', 'storefront-outline') }} />
      <Tabs.Screen
        name="cart"
        options={{ title: 'Cart', tabBarIcon: icon('cart', 'cart-outline'), tabBarBadge: count > 0 ? count : undefined }}
      />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('receipt', 'receipt-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }} />
      <Tabs.Screen name="product/[id]" options={hidden} />
      <Tabs.Screen name="shop/[id]" options={hidden} />
      <Tabs.Screen name="order/[id]" options={hidden} />
      <Tabs.Screen name="checkout" options={hidden} />
      <Tabs.Screen name="order-success" options={hidden} />
      <Tabs.Screen name="addresses" options={hidden} />
      <Tabs.Screen name="notifications" options={hidden} />
    </Tabs>
  );
}
