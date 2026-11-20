import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { APP_NAME } from '../constants/config';
import { colors, font, radius, spacing } from '../theme';

/** The green header with the app name and a white sheet for the form. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <View style={s.logo}><Ionicons name="storefront" size={30} color={colors.primary} /></View>
            <Text style={s.app}>{APP_NAME}</Text>
            <Text style={s.tag}>Fresh from shops near you</Text>
          </View>
          <View style={s.sheet}>
            <Text style={s.title}>{title}</Text>
            {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            <View style={{ marginTop: spacing.lg }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  hero: { alignItems: 'center', paddingVertical: spacing.xl + 8 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  app: { color: colors.white, fontSize: font.xxl, fontWeight: '900', marginTop: spacing.md },
  tag: { color: '#d1fae5', fontSize: font.sm, marginTop: 2 },
  sheet: {
    flex: 1, backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.xl, minHeight: 420,
  },
  title: { fontSize: font.xl + 2, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.md, color: colors.textMuted, marginTop: 4 },
});
void radius;
