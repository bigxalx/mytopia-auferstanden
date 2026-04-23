import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { MISSION_KIND_METADATA } from '@/src/features/tasks/data/missionRepository';
import { useProfileMissionData, type ProfileMissionOverviewItem } from '@/src/features/tasks/data/useProfileMissionData';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function ProfileMissionsModal() {
  const { selectedMode, user } = useSession();
  const profileData = useProfileMissionData(user?.id, selectedMode);

  if (!user) {
    return (
      <Screen headerShown={false} title="Missionen">
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um deine Missionen zu sehen.</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen headerShown={false} title="Missionen">
      {profileData.error ? (
        <SectionCard title="Fehler">
          <Text style={styles.body}>{profileData.error}</Text>
        </SectionCard>
      ) : null}

      {profileData.isLoading ? (
        <SectionCard title="Laden">
          <Text style={styles.body}>Missionen werden geladen…</Text>
        </SectionCard>
      ) : (
        <>
          <MissionSection
            emptyText="Aktuell keine aktiven Missionen."
            items={profileData.activeMissions}
            title="Aktiv"
          />
          <MissionSection
            emptyText="Derzeit nichts in Prüfung."
            items={profileData.pendingMissions}
            title="In Prüfung"
          />
          <MissionSection
            emptyText="Noch keine abgeschlossenen Missionen."
            items={profileData.completedMissions}
            title="Abgeschlossen"
          />
        </>
      )}
    </Screen>
  );
}

function MissionSection({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: ProfileMissionOverviewItem[];
  title: string;
}) {
  return (
    <SectionCard title={title}>
      {items.length === 0 ? (
        <Text style={styles.body}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Link
              asChild
              href={`/(modals)/tasks/${item.mission._id}`}
              key={item.mission._id}
            >
              <Pressable style={styles.row}>
                <View style={styles.rowHeader}>
                  <Text style={styles.kindBadge}>
                    {MISSION_KIND_METADATA[item.mission.kind]?.emoji ?? '❓'}
                  </Text>
                  <Text style={styles.rowTitle}>{item.mission.title}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {(item.status === 'completed' ? item.earnedPoints : item.mission.points) ?? item.mission.points} Punkte
                  {' · '}
                  {getStatusLabel(item)}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function getStatusLabel(item: ProfileMissionOverviewItem) {
  if (item.status === 'completed') {
    return 'Erfolgreich';
  }

  if (item.status === 'pending') {
    return 'Wird überprüft';
  }

  if (item.status === 'rejected') {
    return 'Nicht bestätigt';
  }

  if (item.status === 'expired') {
    return 'Abgelaufen';
  }

  return 'Aktiv';
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  kindBadge: {
    fontSize: 18,
  },
  list: {
    gap: 10,
  },
  row: {
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rowMeta: {
    color: theme.colors.cardTextSecondary,
    fontSize: 12,
    marginLeft: 26,
  },
  rowTitle: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
});
