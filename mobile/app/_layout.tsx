import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loader } from '../src/components/ui';
import { homeFor, useAuth } from '../src/store/auth.store';
import { useCart } from '../src/store/cart.store';
import { View } from 'react-native';
import { colors } from '../src/theme';

/** Which route group each role may open. */
const GROUP_OF: Record<string, string> = {
  customer: '(customer)',
  shop_owner: '(shop-owner)',
  shop_worker: '(labour)',
  admin: '(admin)',
};

export default function RootLayout() {
  const { user, ready, bootstrap } = useAuth();
  const resetCart = useCart((s) => s.reset);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  // keep the user inside the part of the app that belongs to their role
  useEffect(() => {
    if (!ready) return;
    const group = segments[0] as string | undefined;
    if (!user) {
      resetCart();
      if (group !== '(auth)') router.replace('/(auth)/login');
      return;
    }
    const mine = GROUP_OF[user.role];
    if (!mine) {
      // an account with any other role cannot use the store app
      void useAuth.getState().logout();
      return;
    }
    if (group !== mine) router.replace(homeFor(user.role) as never);
  }, [user, ready, segments, router, resetCart]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {!ready ? (
          <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
            <Loader label="Starting Namma Store…" />
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
