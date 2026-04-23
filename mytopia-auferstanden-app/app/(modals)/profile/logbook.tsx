import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { getRewardBreakdownRows } from '@/src/features/tasks/data/rewardFormatting';
import { useProfileMissionData } from '@/src/features/tasks/data/useProfileMissionData';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function ProfileLogbookModal() {
  const { selectedMode, user } = useSession();
  const profileData = useProfileMissionData(user?.id, selectedMode);

  if (!user) {
    return (
      <Screen headerShown={false} title="Logbuch">
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um dein Logbuch zu sehen.</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen headerShown={false} title="Logbuch">
      {profileData.error ? (
        <SectionCard title="Fehler">
          <Text style={styles.body}>{profileData.error}</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Alle Einträge">
        {profileData.isLoading ? (
          <Text style={styles.body}>Logbuch wird geladen…</Text>
        ) : profileData.logbookEntries.length === 0 ? (
          <Text style={styles.body}>Noch keine bestätigten Missionen im Logbuch.</Text>
        ) : (
          <View style={styles.list}>
            {profileData.logbookEntries.map((entry) => {
              const breakdownRows = getRewardBreakdownRows(
                entry.submission.rewardBreakdown,
                entry.submission.streakSummary,
              );

              return (
                <View key={entry.id} style={styles.item}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.title}>{entry.missionTitle}</Text>
                    <Text style={styles.points}>+{entry.points}</Text>
                  </View>
                  <Text style={styles.meta}>{new Date(entry.createdAtMs).toLocaleString('de-DE')}</Text>
                  {breakdownRows.map((row, index) => (
                    <Text key={`${entry.id}:${index}:${row}`} style={styles.detail}>
                      {row}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  detail: {
    color: theme.colors.cardTextSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  item: {
    borderTopColor: theme.colors.cardBorder,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 12,
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  list: {
    gap: 12,
  },
  meta: {
    color: theme.colors.cardTextMuted,
    fontSize: 11,
  },
  points: {
    color: theme.colors.orange,
    fontSize: 16,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
});
