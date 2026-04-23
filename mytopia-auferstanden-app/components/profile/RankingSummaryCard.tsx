import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/shared/ui/theme';

type RankingSummaryCardProps = {
  totalPoints: number;
};

export function RankingSummaryCard({
  totalPoints,
}: RankingSummaryCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Punkte</Text>
      <View style={styles.metricWrap}>
        <Text style={styles.value}>{totalPoints}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.beige,
    borderRadius: 20,
    aspectRatio: 1,
    flex: 1,
    gap: 12,
    justifyContent: 'space-between',
    padding: 20,
  },
  cardTitle: {
    ...theme.typography.h1,
    color: theme.colors.cardTextHeading,
    fontSize: 18,
    marginBottom: 0,
    textTransform: 'uppercase',
    width: '100%',
  },
  metricWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  value: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 44,
    lineHeight: 52,
    textAlign: 'center',
  },
});
