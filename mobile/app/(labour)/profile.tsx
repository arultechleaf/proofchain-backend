import React from 'react';
import { Screen } from '../../src/components/Screen';
import { ProfileMenu } from '../../src/components/ProfileMenu';

export default function LabourProfile() {
  return (
    <Screen tabScreen title="Profile">
      <ProfileMenu links={[
        { icon: 'notifications-outline', label: 'Notifications', href: '/(labour)/notifications' },
        { icon: 'bicycle-outline', label: 'My orders', href: '/(labour)/orders' },
      ]} />
    </Screen>
  );
}
