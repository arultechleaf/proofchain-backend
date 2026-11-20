import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing } from '../theme';
import { ErrorBanner, Loader } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** A page with a title bar, optional back button / right-hand action, pull-to-refresh and error banner. */
export function Screen({
  title, subtitle, back, right, children, loading, error, onRetry, onRefresh, refreshing, scroll = true, padded = true,
  footer, tabScreen = false, titleNode,
}: {
  /** Custom content (for example a logo) shown in place of the title text. */
  titleNode?: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  padded?: boolean;
  /** Pinned under the content (for example a checkout button). */
  footer?: React.ReactNode;
  /** Screens inside a tab bar need no bottom inset. */
  tabScreen?: boolean;
}) {
  const router = useRouter();
  const body = loading ? <Loader /> : (
    <>
      <ErrorBanner message={error ?? ''} onRetry={onRetry} />
      {children}
    </>
  );
  return (
    <SafeAreaView style={s.safe} edges={tabScreen ? ['top'] : ['top', 'bottom']}>
      {title || titleNode || back || right ? (
        <View style={s.header}>
          {back ? (
            <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            {titleNode}
            {title ?<Text style={s.title} numberOfLines={1}>{title}</Text> : null}
            {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[padded && { padding: spacing.lg }, { paddingBottom: spacing.xxl }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padded && { padding: spacing.lg }]}>{body}</View>
        )}
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  footer: {
    padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
});
