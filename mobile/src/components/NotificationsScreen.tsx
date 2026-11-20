import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from './Screen';
import { Button, Card, EmptyState } from './ui';
import { useApi } from '../hooks/useApi';
import { notificationService } from '../services/customer.service';
import { colors, font, spacing } from '../theme';
import { dateTime } from '../utils/format';

/** The notification list shared by all three roles. */
export function NotificationsScreen() {
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => notificationService.list(), []);
  const unread = data?.data.filter((n) => !n.isRead).length ?? 0;

  // opening the list marks everything as read a moment later, so the new ones are still highlighted
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => { void notificationService.markAllRead().catch(() => undefined); }, 2500);
    return () => clearTimeout(t);
  }, [unread]);

  return (
    <Screen back title="Notifications" error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}
      right={unread ? <Button small variant="ghost" title="Mark read" onPress={async () => { await notificationService.markAllRead(); reload(); }} /> : undefined}>
      {loading ? null : !data?.data.length ? <EmptyState icon="notifications-outline" title="No notifications" hint="Order updates will show up here." /> : data.data.map((n) => (
        <Card key={n.id} style={[{ marginBottom: spacing.sm }, !n.isRead && s.unread]}>
          <Text style={s.title}>{n.title}</Text>
          <Text style={s.msg}>{n.message}</Text>
          <Text style={s.time}>{dateTime(n.createdAt)}</Text>
        </Card>
      ))}
      <View />
    </Screen>
  );
}

const s = StyleSheet.create({
  unread: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  title: { fontSize: font.md, fontWeight: '800', color: colors.text },
  msg: { fontSize: font.md, color: colors.text, marginTop: 2 },
  time: { fontSize: font.xs, color: colors.textMuted, marginTop: 6 },
});
