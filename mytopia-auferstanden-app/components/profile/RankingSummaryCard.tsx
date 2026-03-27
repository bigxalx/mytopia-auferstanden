import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

import { useSession, type SessionUser } from '@/src/core/session/SessionContext';
import { useUserPoints } from '@/src/features/tasks/data/useUserPoints';
import { SectionCard } from '@/src/shared/ui/SectionCard';

type RankingSummaryCardProps = {
  user: SessionUser;
  refreshTrigger?: number;
};

export function RankingSummaryCard({ user, refreshTrigger }: RankingSummaryCardProps) {
  const { selectedMode } = useSession();
  const points = useUserPoints(user.id, refreshTrigger);

  return (
    <SectionCard title="Ranking">
      <View style={styles.row}>
        <Text style={styles.label}>Aktuelle Punkte</Text>
        <Text style={styles.value}>
          {points !== null ? points : '—'}
        </Text>
      </View>

      {selectedMode === 'dev' && user.legacySummary ? (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.labelSmall}>Aktuelle Saison</Text>
            <Text style={styles.valueSmall}>
              {points !== null ? points : '—'}
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
