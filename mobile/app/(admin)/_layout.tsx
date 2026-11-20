import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon as icon } from '../../src/components/tabIcon';
import { colors } from '../../src/theme';

const hidden = { href: null } as const;

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 } }}>
      <Tabs.Screen name="overview" options={{ title: 'Overview', tabBarIcon: icon('grid', 'grid-outline') }} />
      <Tabs.Screen name="shops" options={{ title: 'Shops', tabBarIcon: icon('storefront', 'storefront-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('receipt', 'receipt-outline') }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: icon('cube', 'cube-outline') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('people', 'people-outline') }} />
      <Tabs.Screen name="order/[id]" options={hidden} />
      <Tabs.Screen name="notifications" options={hidden} />
    </Tabs>
  );
}
