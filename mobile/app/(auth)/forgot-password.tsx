import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { Button, ErrorBanner, TextField } from '../../src/components/ui';
import { authService } from '../../src/services/auth.service';
import { colors, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

type Step = 'email' | 'code' | 'password';

/** Forgot password: email → emailed code → new password. */
export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  const titles: Record<Step, [string, string]> = {
    email: ['Reset your password', 'Enter your account email and we will send a code'],
    code: ['Check your email', `Enter the 6-digit code sent to ${email}`],
    password: ['Choose a new password', 'Use at least 8 characters'],
  };

  return (
    <AuthShell title={titles[step][0]} subtitle={titles[step][1]}>
      <ErrorBanner message={error} />
      {step === 'email' ? (
        <>
          <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Send code" loading={busy} onPress={() => run(async () => {
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email');
            await authService.forgotPassword(email);
            setStep('code');
          })} />
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <TextField label="6-digit code" icon="key-outline" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
          <Button title="Verify code" loading={busy} disabled={code.length !== 6} onPress={() => run(async () => {
            await authService.verifyResetOtp(email, code);
            setStep('password');
          })} />
        </>
      ) : null}
      {step === 'password' ? (
        <>
          <TextField label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry />
          <Button title="Save password" loading={busy} disabled={password.length < 8} onPress={() => run(async () => {
            await authService.resetPassword(email, password);
            Alert.alert('Password updated', 'You can sign in with your new password now.', [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]);
          })} />
        </>
      ) : null}
      <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '800', marginTop: spacing.xl }} onPress={() => router.back()}>
        Back to sign in
      </Text>
    </AuthShell>
  );
}
