import React from 'react';
import { Tabs } from 'expo-router';
import { tabIcon as icon } from '../../src/components/tabIcon';
import { colors } from '../../src/theme';

const hidden = { href: null } as const;

export default function LabourLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 } }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('bicycle', 'bicycle-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time', 'time-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }} />
      <Tabs.Screen name="order/[id]" options={hidden} />
      <Tabs.Screen name="notifications" options={hidden} />
    </Tabs>
  );
}
