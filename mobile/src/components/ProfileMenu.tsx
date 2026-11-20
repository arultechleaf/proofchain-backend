import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Button } from './ui';
import { useAuth } from '../store/auth.store';
import { colors, font, spacing } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Account card, a list of links and the sign-out button; used by every role's last tab. */
export function ProfileMenu({ links }: { links: Array<{ icon: IconName; label: string; href: string }> }) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const confirm = () => Alert.alert('Sign out', 'Do you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
  ]);
  return (
    <>
      <Card style={s.who}>
        <View style={s.avatar}><Text style={s.initial}>{(user?.name ?? '?').charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{user?.name}</Text>
          <Text style={s.muted}>{user?.email}</Text>
          {user?.mobile ? <Text style={s.muted}>{user.mobile}</Text> : null}
        </View>
      </Card>
      <Card style={{ marginTop: spacing.md, paddingVertical: spacing.sm }}>
        {links.map((l, i) => (
          <Pressable key={l.href} onPress={() => router.push(l.href as never)} style={[s.link, i > 0 && s.border]}>
            <Ionicons name={l.icon} size={20} color={colors.primary} />
            <Text style={s.linkText}>{l.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      <Button title="Sign out" variant="danger" icon="log-out-outline" style={{ marginTop: spacing.xl }} onPress={confirm} />
    </>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontSize: font.xl, fontWeight: '800' },
  name: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkText: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
