import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { HeaderRight } from '../../src/components/HeaderActions';
import { Button, StatTile } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { workerService } from '../../src/services/worker.service';
import { useAuth } from '../../src/store/auth.store';
import { colors, spacing } from '../../src/theme';
import { money } from '../../src/utils/format';

export default function LabourDashboard() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => workerService.dashboard(), []);

  return (
    <Screen tabScreen title={`Hi, ${user?.name?.split(' ')[0] ?? ''}`} subtitle={data?.shop.name}
      right={<HeaderRight notificationsHref="/(labour)/notifications" />}
      loading={loading && !data} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      {data ? (
        <>
          <View style={s.grid}>
            <StatTile label="Waiting to be taken" value={data.waiting} icon="hourglass-outline" tone={colors.warning} />
            <StatTile label="Assigned to me" value={data.assignedToMe} icon="bicycle-outline" tone={colors.info} />
            <StatTile label="Delivered today" value={data.deliveredToday} icon="checkmark-done-outline" />
            <StatTile label="Delivered in total" value={data.deliveredTotal} icon="trophy-outline" />
            <StatTile label="Cash collected today" value={money(data.cashCollectedToday)} icon="cash-outline" tone={colors.success} />
          </View>
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button title="See my orders" icon="bicycle-outline" onPress={() => router.push('/(labour)/orders' as never)} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md } });
