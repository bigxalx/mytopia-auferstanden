import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

import { useSession, type SessionUser } from '@/src/core/session/SessionContext';
import { useUserRewardSummary } from '@/src/features/tasks/data/useUserRewards';
import { SectionCard } from '@/src/shared/ui/SectionCard';

type RankingSummaryCardProps = {
  user: SessionUser;
  refreshTrigger?: number;
};

export function RankingSummaryCard({ user, refreshTrigger }: RankingSummaryCardProps) {
  const { selectedMode } = useSession();
  const summary = useUserRewardSummary(user.id, refreshTrigger);

  return (
    <SectionCard title="Ranking">
      <View style={styles.row}>
        <Text style={styles.label}>Aktuelle Punkte</Text>
        <Text style={styles.value}>
          {summary.points !== null ? summary.points : '—'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Aktueller Streak</Text>
        <Text style={styles.value}>
          {summary.streakCount}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Streak-Multiplikator</Text>
        <Text style={styles.value}>
          x{summary.streakMultiplier.toFixed(1)}
        </Text>
      </View>

      {selectedMode === 'dev' && user.legacySummary ? (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.labelSmall}>Aktuelle Saison</Text>
            <Text style={styles.valueSmall}>
              {summary.points !== null ? summary.points : '—'}
            </Text>
          </View>
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
    backgroundColor: theme.colors.cardBorder,
    height: 1,
    marginVertical: 6,
  },
  label: {
    color: theme.colors.cardTextSecondary,
    flex: 1,
    fontSize: 13,
  },
  labelSmall: {
    color: theme.colors.cardTextSecondary,
    flex: 1,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  valueSmall: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
});
