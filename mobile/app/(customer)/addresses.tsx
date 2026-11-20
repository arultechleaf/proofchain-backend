import React, { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { Button, Card, EmptyState, ErrorBanner, Pill, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { customerService } from '../../src/services/customer.service';
import { useAuth } from '../../src/store/auth.store';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';
import type { Address } from '../../src/types';

interface Form { id?: number; label: string; fullName: string; phone: string; line1: string; landmark: string; city: string; pincode: string; isDefault: boolean }

export default function Addresses() {
  const user = useAuth((s) => s.user);
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => customerService.addresses(), []);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const up = (k: keyof Form) => (v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const blank = (): Form => ({ label: 'Home', fullName: user?.name ?? '', phone: user?.mobile ?? '', line1: '', landmark: '', city: '', pincode: '', isDefault: !data?.length });
  const edit = (a: Address): Form => ({ id: a.id, label: a.label, fullName: a.fullName, phone: a.phone, line1: a.line1, landmark: a.landmark ?? '', city: a.city, pincode: a.pincode, isDefault: a.isDefault });

  const save = async () => {
    if (!form) return;
    if (form.fullName.trim().length < 2) return setFormError('Enter the name');
    if (!/^[6-9]\d{9}$/.test(form.phone)) return setFormError('Enter a valid 10-digit mobile number');
    if (form.line1.trim().length < 3) return setFormError('Enter the address');
    if (!form.city.trim()) return setFormError('Enter the city');
    if (!/^\d{6}$/.test(form.pincode)) return setFormError('The pincode must be 6 digits');
    setBusy(true); setFormError('');
    try {
      const { id, landmark, ...rest } = form;
      await customerService.saveAddress({ ...rest, landmark: landmark.trim() || undefined }, id);
      setForm(null);
      reload();
    } catch (err) { setFormError(errorText(err)); } finally { setBusy(false); }
  };

  const remove = (a: Address) => Alert.alert('Delete address', `Delete "${a.label}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await customerService.removeAddress(a.id); reload(); } catch (err) { Alert.alert('Address', errorText(err)); } } },
  ]);

  if (form) {
    return (
      <Screen back title={form.id ? 'Edit address' : 'New address'}>
        <ErrorBanner message={formError} />
        <TextField label="Label" value={form.label} onChangeText={up('label')} placeholder="Home, Work…" />
        <TextField label="Full name" value={form.fullName} onChangeText={up('fullName')} />
        <TextField label="Mobile number" value={form.phone} onChangeText={(v) => up('phone')(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" />
        <TextField label="Address" value={form.line1} onChangeText={up('line1')} placeholder="House no, street, area" />
        <TextField label="Landmark (optional)" value={form.landmark} onChangeText={up('landmark')} />
        <TextField label="City" value={form.city} onChangeText={up('city')} />
        <TextField label="Pincode" value={form.pincode} onChangeText={(v) => up('pincode')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: font.md, color: colors.text }}>Make this my default address</Text>
          <Switch value={form.isDefault} onValueChange={up('isDefault')} trackColor={{ true: colors.primary }} />
        </View>
        <Button title="Save address" onPress={save} loading={busy} />
        <Button title="Cancel" variant="ghost" onPress={() => { setForm(null); setFormError(''); }} />
      </Screen>
    );
  }

  return (
    <Screen back title="My addresses" error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      footer={<Button title="Add a new address" icon="add" onPress={() => setForm(blank())} />}>
      {loading ? null : !data?.length ? <EmptyState icon="location-outline" title="No saved addresses" hint="Add one to place your order." /> : data.map((a) => (
        <Card key={a.id} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{a.label}</Text>
            {a.isDefault ? <Pill text="Default" tone="success" /> : null}
          </View>
          <Text style={{ color: colors.text, marginTop: 6 }}>{a.fullName} · {a.phone}</Text>
          <Text style={{ color: colors.textMuted, marginTop: 2 }}>{[a.line1, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <Button small variant="outline" title="Edit" onPress={() => setForm(edit(a))} />
            <Button small variant="danger" title="Delete" onPress={() => remove(a)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
