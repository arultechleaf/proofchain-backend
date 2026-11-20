import React from 'react';
import { Screen } from '../../src/components/Screen';
import { ProfileMenu } from '../../src/components/ProfileMenu';

export default function Profile() {
  return (
    <Screen tabScreen title="Profile">
      <ProfileMenu links={[
        { icon: 'location-outline', label: 'My addresses', href: '/(customer)/addresses' },
        { icon: 'notifications-outline', label: 'Notifications', href: '/(customer)/notifications' },
        { icon: 'receipt-outline', label: 'My orders', href: '/(customer)/orders' },
      ]} />
    </Screen>
  );
}
