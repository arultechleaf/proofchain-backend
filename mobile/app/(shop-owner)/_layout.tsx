import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon as icon } from '../../src/components/tabIcon';
import { colors } from '../../src/theme';

const hidden = { href: null } as const;

export default function OwnerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 } }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: icon('grid', 'grid-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('receipt', 'receipt-outline') }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: icon('cube', 'cube-outline') }} />
      <Tabs.Screen name="workers" options={{ title: 'Team', tabBarIcon: icon('people', 'people-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu', 'menu-outline') }} />
      <Tabs.Screen name="order/[id]" options={hidden} />
      <Tabs.Screen name="product-form" options={hidden} />
      <Tabs.Screen name="shop" options={hidden} />
      <Tabs.Screen name="report" options={hidden} />
      <Tabs.Screen name="notifications" options={hidden} />
    </Tabs>
  );
}
