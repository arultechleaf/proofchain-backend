import React from 'react';
import {
  ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow, spacing } from '../theme';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/format';
import type { OrderStatus } from '../types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ── Button ──────────────────────────────────────────────────────────────── */

export function Button({
  title, onPress, loading, disabled, variant = 'primary', icon, small, style,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost' | 'dark';
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, outline: 'transparent', danger: colors.danger, ghost: 'transparent', dark: colors.text }[variant];
  const fg = variant === 'outline' ? colors.primary : variant === 'ghost' ? colors.textMuted : colors.white;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={s.btnInner}>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
          <Text style={[s.btnText, small && { fontSize: font.sm }, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ── Text field ──────────────────────────────────────────────────────────── */

export function TextField({
  label, error, icon, ...rest
}: TextInputProps & { label?: string; error?: string; icon?: IconName }) {
  // a password box gets an eye button that shows or hides what was typed
  const isPassword = !!rest.secureTextEntry;
  const [hidden, setHidden] = React.useState(true);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, !!error && { borderColor: colors.danger }]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          placeholderTextColor="#9aa8a0"
          {...rest}
          secureTextEntry={isPassword ? hidden : rest.secureTextEntry}
          style={[s.input, rest.multiline && { height: 80, textAlignVertical: 'top', paddingTop: 10 }, rest.style]}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/* ── Containers ──────────────────────────────────────────────────────────── */

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? <Text onPress={onAction} style={s.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Text style={[s.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function Pill({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const map = {
    info: [colors.infoLight, colors.info],
    success: [colors.primaryLight, colors.success],
    warning: [colors.warningLight, colors.warning],
    danger: [colors.dangerLight, colors.danger],
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: map[0] }]}>
      <Text style={[s.badgeText, { color: map[1] }]}>{text}</Text>
    </View>
  );
}

export function StatTile({ label, value, icon, tone }: { label: string; value: string | number; icon: IconName; tone?: string }) {
  const c = tone ?? colors.primary;
  return (
    <View style={s.tile}>
      <View style={[s.tileIcon, { backgroundColor: c + '1f' }]}>
        <Ionicons name={icon} size={18} color={c} />
      </View>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

/* ── Feedback ────────────────────────────────────────────────────────────── */

export function Loader({ label }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[s.muted, { marginTop: spacing.sm }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, hint, action }: {
  icon?: IconName; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <View style={s.center}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={34} color={colors.primary} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{hint}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View style={s.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={{ color: colors.danger, flex: 1, fontSize: font.sm }}>{message}</Text>
      {onRetry ? <Text onPress={onRetry} style={{ color: colors.danger, fontWeight: '700' }}>Retry</Text> : null}
    </View>
  );
}

/* ── Small controls ──────────────────────────────────────────────────────── */

export function QtyStepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <View style={s.stepper}>
      <Pressable hitSlop={8} onPress={() => value > min && onChange(value - 1)} style={s.stepBtn}>
        <Ionicons name={value <= 1 && min === 0 ? 'trash-outline' : 'remove'} size={16} color={colors.primary} />
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable hitSlop={8} onPress={() => value < max && onChange(value + 1)} style={s.stepBtn}>
        <Ionicons name="add" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export function Stars({ value, count, size = 13 }: { value: number; count?: number; size?: number }) {
  if (!count) return <Text style={s.mutedSmall}>No ratings yet</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={s.ratingPill}>
        <Text style={s.ratingText}>{value.toFixed(1)}</Text>
        <Ionicons name="star" size={size - 2} color={colors.white} />
      </View>
      <Text style={s.mutedSmall}>({count})</Text>
    </View>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && { color: colors.text, fontWeight: '700' }]}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: '800', fontSize: font.lg }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnSmall: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: font.md, fontWeight: '700' },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md,
  },
  input: { flex: 1, height: 48, fontSize: font.md, color: colors.text },
  error: { color: colors.danger, fontSize: font.xs, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  sectionAction: { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, marginRight: 8,
  },
  chipText: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
  tile: { flex: 1, minWidth: '46%', backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  tileValue: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  tileLabel: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  muted: { color: colors.textMuted, fontSize: font.sm },
  mutedSmall: { color: colors.textMuted, fontSize: font.xs },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerLight, padding: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.md,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  stepValue: { minWidth: 26, textAlign: 'center', fontWeight: '800', color: colors.text },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  ratingText: { color: colors.white, fontWeight: '700', fontSize: font.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowLabel: { color: colors.textMuted, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '600' },
});
