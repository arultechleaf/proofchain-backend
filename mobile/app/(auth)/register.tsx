import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthShell } from '../../src/components/AuthShell';
import { Button, ErrorBanner, TextField } from '../../src/components/ui';
import { authService } from '../../src/services/auth.service';
import { RegisterDraft, useRegisterDraft } from '../../src/store/register.store';
import { colors, font, radius, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function Register() {
  const router = useRouter();
  const setDraft = useRegisterDraft((s) => s.set);
  const [f, setF] = useState<RegisterDraft>(useRegisterDraft.getState().draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const up = (k: keyof RegisterDraft) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const problem = () => {
    if (f.name.trim().length < 2) return 'Enter your name';
    if (!EMAIL.test(f.email.trim())) return 'Enter a valid email';
    if (!/^[6-9]\d{9}$/.test(f.mobile)) return 'Enter a valid 10-digit mobile number';
    if (f.password.length < 8) return 'The password needs at least 8 characters';
    if (f.kind === 'owner' && f.shopName.trim().length < 2) return 'Enter your shop name';
    if (f.kind === 'owner' && f.pincode && !/^\d{6}$/.test(f.pincode)) return 'The pincode must be 6 digits';
    return '';
  };

  const next = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true);
    setError('');
    try {
      await authService.sendOtp(f.email);
      setDraft(f);
      router.push('/(auth)/otp');
    } catch (err) {
      setError(errorText(err, 'Could not send the verification code'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="We will email you a code to verify it">
      <View style={s.kinds}>
        {([
          ['customer', 'bag-handle-outline', 'I want to shop'],
          ['owner', 'storefront-outline', 'I own a shop'],
        ] as const).map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => setF((p) => ({ ...p, kind: k }))} style={[s.kind, f.kind === k && s.kindOn]}>
            <Ionicons name={icon} size={22} color={f.kind === k ? colors.white : colors.primary} />
            <Text style={[s.kindText, f.kind === k && { color: colors.white }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorBanner message={error} />
      <TextField label="Full name" icon="person-outline" value={f.name} onChangeText={up('name')} placeholder="Your name" />
      <TextField label="Email" icon="mail-outline" value={f.email} onChangeText={up('email')} autoCapitalize="none"
        keyboardType="email-address" placeholder="you@example.com" />
      <TextField label="Mobile number" icon="call-outline" value={f.mobile} onChangeText={(v) => up('mobile')(v.replace(/\D/g, '').slice(0, 10))}
        keyboardType="number-pad" placeholder="10-digit number" />
      <TextField label="Password" icon="lock-closed-outline" value={f.password} onChangeText={up('password')} secureTextEntry
        placeholder="At least 8 characters" />

      {f.kind === 'owner' ? (
        <>
          <Text style={s.group}>Your shop</Text>
          <TextField label="Shop name" icon="storefront-outline" value={f.shopName} onChangeText={up('shopName')} placeholder="Ravi Stores" />
          <TextField label="Address" icon="location-outline" value={f.shopAddress} onChangeText={up('shopAddress')} placeholder="Street, area" />
          <TextField label="City" value={f.city} onChangeText={up('city')} placeholder="City" />
          <TextField label="Pincode" value={f.pincode} onChangeText={(v) => up('pincode')(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" placeholder="6 digits" />
        </>
      ) : null}

      <Button title="Send verification code" onPress={next} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: 6 }}>
        <Text style={{ color: colors.textMuted }}>Already have an account?</Text>
        <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => router.replace('/(auth)/login')}>Sign in</Text>
      </View>
    </AuthShell>
  );
}

const s = StyleSheet.create({
  kinds: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  kind: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.primary, backgroundColor: colors.white,
  },
  kindOn: { backgroundColor: colors.primary },
  kindText: { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  group: { fontSize: font.md, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
});
