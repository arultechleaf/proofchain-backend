import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { Button, ErrorBanner, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService } from '../../src/services/owner.service';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

export default function ShopSettings() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi(() => ownerService.shop(), []);
  const [f, setF] = useState({ name: '', description: '', phone: '', address: '', city: '', pincode: '', deliveryFee: '', freeDeliveryAbove: '', minOrder: '' });
  const [isOpen, setIsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const up = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!data) return;
    setF({
      name: data.name, description: data.description ?? '', phone: data.phone ?? '', address: data.address ?? '', city: data.city ?? '',
      pincode: data.pincode ?? '', deliveryFee: String(data.deliveryFee), freeDeliveryAbove: String(data.freeDeliveryAbove), minOrder: String(data.minOrder),
    });
    setIsOpen(data.isOpen);
  }, [data]);

  const save = async () => {
    if (f.name.trim().length < 2) return setProblem('Enter the shop name');
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) return setProblem('The pincode must be 6 digits');
    setBusy(true); setProblem('');
    try {
      await ownerService.updateShop({
        name: f.name.trim(), description: f.description.trim(), phone: f.phone.trim(), address: f.address.trim(), city: f.city.trim(), pincode: f.pincode || undefined,
        isOpen, deliveryFee: Number(f.deliveryFee) || 0, freeDeliveryAbove: Number(f.freeDeliveryAbove) || 0, minOrder: Number(f.minOrder) || 0,
      });
      router.back();
    } catch (err) { setProblem(errorText(err, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <Screen back title="Shop settings" loading={loading} error={error} onRetry={reload}
      footer={<Button title="Save" onPress={save} loading={busy} />}>
      <ErrorBanner message={problem} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }}>Shop is open</Text>
        <Switch value={isOpen} onValueChange={setIsOpen} trackColor={{ true: colors.primary }} />
      </View>
      <TextField label="Shop name" value={f.name} onChangeText={up('name')} />
      <TextField label="About the shop" value={f.description} onChangeText={up('description')} multiline />
      <TextField label="Phone" value={f.phone} onChangeText={(v) => up('phone')(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" />
      <TextField label="Address" value={f.address} onChangeText={up('address')} />
      <TextField label="City" value={f.city} onChangeText={up('city')} />
      <TextField label="Pincode" value={f.pincode} onChangeText={(v) => up('pincode')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
      <TextField label="Delivery fee (₹)" value={f.deliveryFee} onChangeText={up('deliveryFee')} keyboardType="decimal-pad" />
      <TextField label="Free delivery above (₹, 0 = never)" value={f.freeDeliveryAbove} onChangeText={up('freeDeliveryAbove')} keyboardType="decimal-pad" />
      <TextField label="Minimum order (₹)" value={f.minOrder} onChangeText={up('minOrder')} keyboardType="decimal-pad" />
    </Screen>
  );
}
