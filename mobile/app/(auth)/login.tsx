import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { Button, ErrorBanner, TextField } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth.store';
import { colors, font, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

export default function Login() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // the root layout sends the user to the right home screen once signed in
      await login(email, password);
    } catch (err) {
      setError(errorText(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue">
      <ErrorBanner message={error} />
      <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none"
        keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
      <TextField label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="password" placeholder="Your password" onSubmitEditing={submit} />
      <Pressable onPress={() => router.push('/(auth)/forgot-password' as never)} style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>Forgot password?</Text>
      </Pressable>
      <Button title="Sign in" onPress={submit} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: 6 }}>
        <Text style={{ color: colors.textMuted }}>New here?</Text>
        <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={() => router.push('/(auth)/register')}>Create an account</Text>
      </View>
    </AuthShell>
  );
}
