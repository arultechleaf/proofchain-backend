import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { LogoutButton } from '../../src/components/HeaderActions';
import { Card, EmptyState, Pill } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { adminService } from '../../src/services/admin.service';
import { colors, font, spacing } from '../../src/theme';
import { money } from '../../src/utils/format';

export default function AdminCustomers() {
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => adminService.customers(), []);
  return (
    <Screen tabScreen title="Customers" subtitle={data ? `${data.length} customer${data.length === 1 ? '' : 's'}` : undefined} right={<LogoutButton />}
      error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {loading && !data ? null : !data?.length ? <EmptyState icon="people-outline" title="No customers yet" /> : data.map((c) => (
        <Card key={c.id} style={s.row}>
          <View style={s.avatar}><Text style={s.initial}>{c.name.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{c.name}</Text>
            <Text style={s.muted}>{c.email}{c.mobile ? ` · ${c.mobile}` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <Pill text={`${c.orders} order${c.orders === 1 ? '' : 's'}`} />
              <Pill text={`Spent ${money(c.spent)}`} tone="success" />
              {c.isActive ? null : <Pill text="Inactive" tone="danger" />}
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontWeight: '800', fontSize: font.lg },
  name: { fontSize: font.md, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted },
});
