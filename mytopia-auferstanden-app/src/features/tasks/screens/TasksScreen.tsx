import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/shared/ui/theme';
import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { useSession } from '@/src/core/session/SessionContext';

export function TasksScreen() {
  const { user, selectedMode } = useSession();
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await fetchMissions({ mode: selectedMode });
        if (active) setMissions(result);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load missions.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [selectedMode]);

  return (
    <Screen title="Missionen" subtitle="Schließe Missionen ab, um Punkte zu sammeln.">
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.orange} />
          <Text style={styles.loadingText}>Missionen werden geladen…</Text>
        </View>
      ) : error ? (
        <SectionCard title="Fehler">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      ) : missions.length === 0 ? (
        <SectionCard title="Keine Missionen">
          <Text style={styles.body}>Es sind aktuell keine Missionen verfügbar.</Text>
        </SectionCard>
      ) : (
        <SectionCard title="Verfügbare Missionen">
          {missions.map((mission) => {
            const isCompleted = completedMissions.includes(mission._id);
            const submissionState = submissionStates[mission._id];
            const isPending = !isCompleted && submissionState?.status === 'pending';
            const isRejected = !isCompleted && submissionState?.status === 'rejected';
            const isDone = isCompleted || isPending;

            return (
              <Link asChild href={`/tasks/${mission._id}`} key={mission._id}>
                <Pressable
                  disabled={isDone}
                  style={[
                    styles.row,
                    isDone ? styles.rowCompleted : null,
                    isRejected ? styles.rowRejected : null,
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <Text style={styles.kindBadge}>
                      {mission.kind === 'quiz' ? '🧠' : mission.kind === 'gps' ? '📍' : mission.kind === 'text' ? '📝' : mission.kind === 'photo' ? '📸' : '❓'}
                    </Text>
                    <Text style={styles.rowTitle}>
                      {mission.title} {isCompleted ? '✅' : isPending ? '⏳' : isRejected ? '❌' : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {mission.kind === 'quiz' ? 'Quiz' : mission.kind === 'gps' ? 'GPS' : mission.kind === 'text' ? 'Text' : mission.kind === 'photo' ? 'Foto' : mission.kind} · {mission.points} Punkte
                    {isCompleted ? ' · Abgeschlossen' : isPending ? ' · Wird überprüft' : isRejected ? ' · Nicht bestätigt' : ''}
                    {mission.kind === 'quiz' && mission.questionCount
                      ? ` · ${mission.questionCount} Fragen`
                      : ''}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </SectionCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  centered: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    lineHeight: 20,
  },
  kindBadge: {
    fontSize: 18,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  row: {
    borderColor: theme.colors.cardBorder,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowCompleted: {
    backgroundColor: theme.colors.cardSubtleBackground,
  },
  rowRejected: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
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
    fontSize: 15,
    fontWeight: '600',
  },
});
