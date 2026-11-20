import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from './ui';
import { useCart } from '../store/cart.store';
import type { Order } from '../types';

/** "Repeat order": puts the same items back in the cart in one tap. */
export function RepeatOrderButton({ order, small }: { order: Order; small?: boolean }) {
  const router = useRouter();
  const repeat = useCart((s) => s.repeat);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const { added, skipped } = await repeat(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unit: i.unit })));
      if (!added) Alert.alert('Repeat order', 'None of these items are available right now.');
      else {
        if (skipped) Alert.alert('Repeat order', `${skipped} item${skipped > 1 ? 's were' : ' was'} not available and left out.`);
        router.push('/(customer)/cart' as never);
      }
    } finally { setBusy(false); }
  };

  return <Button small={small} variant="outline" icon="repeat-outline" title="Repeat order" loading={busy} onPress={go} />;
}
