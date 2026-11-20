import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../theme';
import { useAuth } from '../store/auth.store';
import { useApi } from '../hooks/useApi';
import { notificationService } from '../services/customer.service';

/** Bell with the unread count; opens the notifications screen of the current role. */
export function BellButton({ href }: { href: string }) {
  const router = useRouter();
  const { data } = useApi(() => notificationService.unread(), []);
  return (
    <Pressable onPress={() => router.push(href as never)} hitSlop={10} style={s.btn}>
      <Ionicons name="notifications-outline" size={20} color={colors.text} />
      {data ? <View style={s.dot}><Text style={s.dotText}>{data > 9 ? '9+' : data}</Text></View> : null}
    </Pressable>
  );
}

/** Sign-out button with a confirmation. */
export function LogoutButton() {
  const logout = useAuth((st) => st.logout);
  const confirm = () => Alert.alert('Sign out', 'Do you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
  ]);
  return (
    <Pressable onPress={confirm} hitSlop={10} style={s.btn}>
      <Ionicons name="log-out-outline" size={20} color={colors.text} />
    </Pressable>
  );
}

export function HeaderRight({ notificationsHref }: { notificationsHref: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <BellButton href={notificationsHref} />
      <LogoutButton />
    </View>
  );
}

const s = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  dotText: { color: colors.white, fontSize: 9, fontWeight: '800' },
});
