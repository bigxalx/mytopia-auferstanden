import { StyleSheet, Text, View } from 'react-native';

import { SessionUser } from '@/src/core/session/SessionContext';
import { SectionCard } from '@/src/shared/ui/SectionCard';

type RankingSummaryCardProps = {
  user: SessionUser;
};

export function RankingSummaryCard({ user }: RankingSummaryCardProps) {
  return (
    <SectionCard
      title="Ranking summary"
      description="Season ranking is separate from legacy rank; this card keeps continuity visible."
    >
      <View style={styles.row}>
        <Text style={styles.label}>Current season rank</Text>
        <Text style={styles.value}>#128</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Current season points</Text>
        <Text style={styles.value}>145</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Legacy rank snapshot</Text>
        <Text style={styles.value}>
          {user.legacySummary ? `#${user.legacySummary.rankSnapshot}` : 'n/a'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Legacy total points</Text>
        <Text style={styles.value}>{user.legacySummary?.totalPoints ?? 'n/a'}</Text>
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: '#101828',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});
