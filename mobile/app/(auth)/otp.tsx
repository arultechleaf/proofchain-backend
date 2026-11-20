import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/AuthShell';
import { Button, ErrorBanner } from '../../src/components/ui';
import { authService } from '../../src/services/auth.service';
import { useAuth } from '../../src/store/auth.store';
import { useRegisterDraft } from '../../src/store/register.store';
import { colors, font, radius, spacing } from '../../src/theme';
import { errorText } from '../../src/utils/format';

const LENGTH = 6;
const RESEND_SECONDS = 60;

/** Step 2 of sign-up: type the 6-digit email code, then the account is created and signed in. */
export default function Otp() {
  const router = useRouter();
  const { draft, clear } = useRegisterDraft();
  const login = useAuth((s) => s.login);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(RESEND_SECONDS);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const verifiedEmail = useRef('');

  // arrived here without a form (for example after a reload)
  useEffect(() => { if (!draft.email) router.replace('/(auth)/register'); }, [draft.email, router]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // the server accepts a code once; if sign-up failed after this, retry without verifying again
      if (verifiedEmail.current !== draft.email) {
        await authService.verifyOtp(draft.email, value);
        verifiedEmail.current = draft.email;
      }
      if (draft.kind === 'owner') {
        await authService.registerOwner({
          name: draft.name, email: draft.email, mobile: draft.mobile, password: draft.password,
          shopName: draft.shopName, shopAddress: draft.shopAddress || undefined, city: draft.city || undefined, pincode: draft.pincode || undefined,
        });
      } else {
        await authService.registerCustomer({ name: draft.name, email: draft.email, mobile: draft.mobile, password: draft.password });
      }
      const email = draft.email;
      const password = draft.password;
      clear();
      await login(email, password); // the root layout opens the right home screen
    } catch (err) {
      setError(errorText(err, 'Could not verify the code'));
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (digits.length === LENGTH) void verify(digits);
  };

  const resend = async () => {
    setError('');
    try {
      await authService.sendOtp(draft.email);
      verifiedEmail.current = '';
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(errorText(err, 'Could not send a new code'));
    }
  };

  return (
    <AuthShell title="Verify your email" subtitle={`Enter the 6-digit code sent to ${draft.email}`}>
      <ErrorBanner message={error} />
      <Pressable onPress={() => input.current?.focus()} style={s.boxes}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[s.box, code.length === i && s.boxOn, !!code[i] && s.boxFilled]}>
            <Text style={s.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input} value={code} onChangeText={onChange} keyboardType="number-pad" maxLength={LENGTH} autoFocus
        textContentType="oneTimeCode" autoComplete="sms-otp" style={s.hidden}
      />
      <Button title="Verify and create account" onPress={() => verify(code)} loading={busy} disabled={code.length !== LENGTH} />
      <Text style={s.resend}>
        Did not get it?{' '}
        {wait > 0 ? <Text style={{ color: colors.textMuted }}>Resend in {wait}s</Text>
          : <Text style={{ color: colors.primary, fontWeight: '800' }} onPress={resend}>Resend code</Text>}
      </Text>
      <Text style={[s.resend, { marginTop: spacing.md }]} onPress={() => router.back()}>Change email</Text>
    </AuthShell>
  );
}

const s = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  box: {
    width: 46, height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: colors.primary },
  boxFilled: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  digit: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted, fontSize: font.sm },
});
