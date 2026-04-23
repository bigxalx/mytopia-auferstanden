import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import { useProfileMissionData } from '@/src/features/tasks/data/useProfileMissionData';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { theme } from '@/src/shared/ui/theme';

export default function BadgeDetailModal() {
  const { badgeId } = useLocalSearchParams<{ badgeId: string }>();
  const { selectedMode, user } = useSession();
  const profileData = useProfileMissionData(user?.id, selectedMode);
  const badge = profileData.badges.find((candidate) => candidate.id === badgeId);

  if (!user) {
    return (
      <Screen headerShown={false} title="Abzeichen">
        <SectionCard title="Keine aktive Sitzung">
          <Text style={styles.body}>Melde dich an, um Abzeichen zu sehen.</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (!badge) {
    return (
      <Screen headerShown={false} title="Abzeichen">
        <SectionCard title={profileData.isLoading ? 'Laden' : 'Nicht gefunden'}>
          <Text style={styles.body}>
            {profileData.isLoading ? 'Abzeichen wird geladen…' : 'Dieses Abzeichen wurde nicht gefunden.'}
          </Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen headerShown={false} title="Abzeichen">
      <SectionCard title={badge.title}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <MaterialIcons color={theme.colors.orange} name="workspace-premium" size={42} />
          </View>
          {badge.description ? <Text style={styles.body}>{badge.description}</Text> : null}
          {badge.bonusPoints > 0 ? <Text style={styles.points}>+{badge.bonusPoints} Bonus</Text> : null}
        </View>
      </SectionCard>

      <SectionCard title="Erhalten durch">
        <View style={styles.list}>
          {badge.awards.map((award) => (
            <Link
              asChild
              href={`/(modals)/tasks/${award.missionId}`}
              key={`${award.missionId}:${award.awardedAtMs}`}
            >
              <Pressable style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
                <View style={styles.rowContent}>
                  <Text numberOfLines={1} style={styles.title}>{award.missionTitle}</Text>
                  <Text style={styles.meta}>{new Date(award.awardedAtMs).toLocaleString('de-DE')}</Text>
                </View>
                <Text style={styles.pointsSmall}>+{award.points}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderColor: theme.colors.orangeStroke,
    borderRadius: 999,
    borderWidth: 1,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  list: {
    gap: 10,
  },
  meta: {
    color: theme.colors.cardTextMuted,
    fontSize: 12,
  },
  points: {
    color: theme.colors.orange,
    fontSize: 18,
    fontWeight: '900',
  },
  pointsSmall: {
    color: theme.colors.orange,
    fontSize: 15,
    fontWeight: '900',
  },
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardSubtleBackground,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowPressed: {
    opacity: 0.75,
  },
  title: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
