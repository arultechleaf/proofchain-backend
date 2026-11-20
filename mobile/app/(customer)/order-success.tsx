import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button, Card } from '../../src/components/ui';
import { colors, font, spacing } from '../../src/theme';

/** Shown right after checkout: the order number(s) and the 4-digit code to give on delivery or pickup. */
export default function OrderSuccess() {
  const router = useRouter();
  const p = useLocalSearchParams<{ orderNos?: string; codes?: string; pickup?: string; slot?: string }>();
  const nos = (p.orderNos ?? '').split(',').filter(Boolean);
  const codes = (p.codes ?? '').split(',');
  const pickup = p.pickup === '1';

  return (
    <Screen title="Order placed">
      <View style={s.hero}>
        <View style={s.tick}><Ionicons name="checkmark" size={44} color={colors.white} /></View>
        <Text style={s.big}>Thank you!</Text>
        <Text style={s.muted}>The shop has been told about your order.</Text>
        {p.slot ? <Text style={s.muted}>{pickup ? 'Pickup' : 'Delivery'}: {p.slot}</Text> : null}
      </View>

      {nos.map((no, i) => (
        <Card key={no} style={{ marginBottom: spacing.md, alignItems: 'center' }}>
          <Text style={s.muted}>Order number</Text>
          <Text style={s.no}>{no}</Text>
          <Text style={[s.muted, { marginTop: spacing.sm }]}>{pickup ? 'Pickup code' : 'Delivery code'}</Text>
          <Text style={s.code}>{codes[i] ?? ''}</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>
            {pickup ? 'Show this code at the shop when you collect your order.' : 'Tell this code to the delivery person only when you receive your order.'}
          </Text>
        </Card>
      ))}

      <Button title="Track my orders" onPress={() => router.replace('/(customer)/orders' as never)} />
      <Button title="Continue shopping" variant="outline" style={{ marginTop: spacing.sm }} onPress={() => router.replace('/(customer)/home' as never)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  tick: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  big: { fontSize: font.xxl, fontWeight: '900', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  no: { fontSize: font.xl, fontWeight: '800', color: colors.text, marginVertical: 2 },
  code: { fontSize: 38, fontWeight: '900', letterSpacing: 8, color: colors.primaryDark, marginVertical: 4 },
});
