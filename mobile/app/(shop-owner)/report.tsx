import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { Card, Chip, EmptyState, Row, SectionTitle, StatTile } from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { ownerService } from '../../src/services/owner.service';
import { colors, font, spacing } from '../../src/theme';
import { isoDay, money, shortDate, STATUS_LABEL } from '../../src/utils/format';
import type { OrderStatus } from '../../src/types';

const RANGES: Array<[number, string]> = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];

export default function ReportScreen() {
  const [days, setDays] = useState(7);
  const { data, loading, error, reload, refresh, refreshing } = useApi(() => {
    const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days - 1));
    return ownerService.report(isoDay(from), isoDay(to));
  }, [days]);
  const best = Math.max(1, ...(data?.daily.map((d) => d.sales) ?? [1]));

  return (
    <Screen back title="Sales report" loading={loading && !data} error={error} onRetry={reload} onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        {RANGES.map(([d, label]) => <Chip key={d} label={label} active={days === d} onPress={() => setDays(d)} />)}
      </View>
      {data ? (
        <>
          <View style={s.grid}>
            <StatTile label="Sales" value={money(data.sales)} icon="cash-outline" />
            <StatTile label="Orders" value={data.orders} icon="receipt-outline" tone={colors.info} />
            <StatTile label="Delivered" value={data.delivered} icon="checkmark-done-outline" />
            <StatTile label="Average order" value={money(data.averageOrder)} icon="analytics-outline" tone={colors.warning} />
          </View>

          <SectionTitle title="Sales by day" />
          <Card>
            {!data.daily.length ? <Text style={s.muted}>No sales in this period.</Text> : data.daily.map((d) => (
              <View key={d.date} style={s.dayRow}>
                <Text style={s.day}>{shortDate(d.date)}</Text>
                <View style={s.track}><View style={[s.bar, { width: `${Math.max(2, (d.sales / best) * 100)}%` }]} /></View>
                <Text style={s.amount}>{money(d.sales)}</Text>
              </View>
            ))}
          </Card>

          <SectionTitle title="Top products" />
          {!data.topProducts.length ? <EmptyState icon="cube-outline" title="No sales yet" /> : (
            <Card>{data.topProducts.map((p) => <Row key={p.name} label={`${p.name} × ${p.quantity}`} value={money(p.amount)} />)}</Card>
          )}

          <SectionTitle title="Orders by status" />
          <Card>
            {Object.entries(data.byStatus).map(([k, v]) => <Row key={k} label={STATUS_LABEL[k as OrderStatus] ?? k} value={String(v)} />)}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  muted: { color: colors.textMuted, fontSize: font.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  day: { width: 52, fontSize: font.sm, color: colors.textMuted },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  amount: { width: 78, textAlign: 'right', fontSize: font.sm, fontWeight: '700', color: colors.text },
});
