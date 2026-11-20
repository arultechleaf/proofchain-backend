import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { Button, Card, EmptyState, ErrorBanner, TextField } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService } from '../../src/services/owner.service';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

export default function Workers() {
  const { data, loading, error, reload, refresh, refreshing, setData } = useApi(() => ownerService.workers(), []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const up = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const add = async () => {
    if (f.name.trim().length < 2) return setProblem('Enter the name');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setProblem('Enter a valid email');
    if (!/^[6-9]\d{9}$/.test(f.mobile)) return setProblem('Enter a valid 10-digit mobile number');
    if (f.password.length < 8) return setProblem('The password needs at least 8 characters');
    setBusy(true); setProblem('');
    try {
      await ownerService.addWorker({ ...f, name: f.name.trim(), email: f.email.trim().toLowerCase() });
      setF({ name: '', email: '', mobile: '', password: '' }); setAdding(false); reload();
    } catch (err) { setProblem(errorText(err)); } finally { setBusy(false); }
  };
  const setActive = async (id: number, isActive: boolean) => {
    try { setData(await ownerService.editWorker(id, { isActive })); } catch (err) { Alert.alert('Team', errorText(err)); }
  };

  return (
    <Screen tabScreen title="Delivery team" right={<HeaderRight notificationsHref="/(shop-owner)/notifications" />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      footer={adding ? undefined : <Button title="Add a team member" icon="person-add-outline" onPress={() => setAdding(true)} />}>
      {adding ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={s.title}>New team member</Text>
          <ErrorBanner message={problem} />
          <TextField label="Name" value={f.name} onChangeText={up('name')} />
          <TextField label="Email" value={f.email} onChangeText={up('email')} autoCapitalize="none" keyboardType="email-address" />
          <TextField label="Mobile number" value={f.mobile} onChangeText={(v) => up('mobile')(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" />
          <TextField label="Password" value={f.password} onChangeText={up('password')} secureTextEntry placeholder="At least 8 characters" />
          <Button title="Add member" onPress={add} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => { setAdding(false); setProblem(''); }} />
        </Card>
      ) : null}
      {loading ? null : !data?.length && !adding ? <EmptyState icon="people-outline" title="No team members yet" hint="Add delivery people so they can pick up and deliver orders." /> : (data ?? []).map((w) => (
        <Card key={w.id} style={[s.row, { marginBottom: spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{w.name}</Text>
            <Text style={s.muted}>{w.email}{w.mobile ? ` · ${w.mobile}` : ''}</Text>
            <Text style={s.muted}>{w.delivered} delivered</Text>
          </View>
          <Switch value={w.isActive} onValueChange={(v) => setActive(w.id, v)} trackColor={{ true: colors.primary }} />
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
});
