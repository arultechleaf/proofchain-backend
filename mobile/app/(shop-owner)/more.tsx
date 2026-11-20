import React from 'react';
import { Screen } from '../../src/components/Screen';
import { ProfileMenu } from '../../src/components/ProfileMenu';

export default function OwnerMore() {
  return (
    <Screen tabScreen title="More">
      <ProfileMenu links={[
        { icon: 'storefront-outline', label: 'Shop settings', href: '/(shop-owner)/shop' },
        { icon: 'bar-chart-outline', label: 'Sales report', href: '/(shop-owner)/report' },
        { icon: 'notifications-outline', label: 'Notifications', href: '/(shop-owner)/notifications' },
      ]} />
    </Screen>
  );
}
