import { StyleSheet, Text, View } from 'react-native';

import { SessionUser } from '@/src/core/session/SessionContext';
import { useUserPoints } from '@/src/features/tasks/data/useUserPoints';
import { SectionCard } from '@/src/shared/ui/SectionCard';

type RankingSummaryCardProps = {
  user: SessionUser;
};

export function RankingSummaryCard({ user }: RankingSummaryCardProps) {
  const points = useUserPoints(user.id);

  return (
    <SectionCard title="Ranking">
      <View style={styles.row}>
        <Text style={styles.label}>Aktuelle Punkte</Text>
        <Text style={styles.value}>
          {points !== null ? points : '—'}
        </Text>
      </View>
      {user.legacySummary ? (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.labelSmall}>Legacy Rang</Text>
            <Text style={styles.valueSmall}>
              {user.legacySummary.rankSnapshot ? `#${user.legacySummary.rankSnapshot}` : 'n/a'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.labelSmall}>Legacy Punkte</Text>
            <Text style={styles.valueSmall}>
              {user.legacySummary.totalPoints ?? 'n/a'}
            </Text>
          </View>
        </>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: '#374151',
    height: 1,
    marginVertical: 6,
  },
  label: {
    color: '#9ca3af',
    flex: 1,
    fontSize: 13,
  },
  labelSmall: {
    color: '#6b7280',
    flex: 1,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: '#f9fafb',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  valueSmall: {
    color: '#9ca3af',
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
});

