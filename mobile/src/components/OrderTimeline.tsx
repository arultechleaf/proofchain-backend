import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, spacing } from '../theme';
import { dateTime, STATUS_LABEL } from '../utils/format';
import type { OrderEvent } from '../types';

/** The history of an order, newest at the bottom, with who did each step. */
export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  // the "assigned" and "taken" steps repeat the status; show them as notes under the last real step
  return (
    <View>
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const bad = e.status === 'cancelled' || e.status === 'rejected';
        const color = bad ? colors.danger : colors.primary;
        return (
          <View key={e.id} style={s.row}>
            <View style={s.rail}>
              <View style={[s.dot, { backgroundColor: last ? color : colors.white, borderColor: color }]}>
                {last ? <Ionicons name={bad ? 'close' : 'checkmark'} size={11} color={colors.white} /> : null}
              </View>
              {!last ? <View style={[s.line, { backgroundColor: color }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: spacing.md }}>
              <Text style={[s.title, last && { color }]}>{e.note && !/^Taken|^Assigned/.test(e.note) ? STATUS_LABEL[e.status] : STATUS_LABEL[e.status]}</Text>
              <Text style={s.meta}>{dateTime(e.createdAt)}{e.byName ? ` · ${e.byName}` : ''}</Text>
              {e.note ? <Text style={s.note}>{e.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 18 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginTop: 2 },
  title: { fontSize: font.md, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  note: { fontSize: font.sm, color: colors.text, marginTop: 2 },
});
