import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { useSession } from '@/src/core/session/SessionContext';

export function TasksScreen() {
  const { user, selectedMode } = useSession();
  const completedMissions = useCompletedMissions(user?.id);
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
          <ActivityIndicator size="large" color="#f97316" />
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
            return (
              <Link asChild href={`/tasks/${mission._id}`} key={mission._id}>
                <Pressable style={[styles.row, isCompleted && styles.rowCompleted]} disabled={isCompleted}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.kindBadge}>
                      {mission.kind === 'quiz' ? '🧠' : '📍'}
                    </Text>
                    <Text style={styles.rowTitle}>{mission.title} {isCompleted ? '✅' : ''}</Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {mission.kind === 'quiz' ? 'Quiz' : 'GPS'} · {mission.points} Punkte
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
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  centered: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  errorText: {
    color: '#a12b2b',
    fontSize: 14,
    lineHeight: 20,
  },
  kindBadge: {
    fontSize: 18,
  },
  loadingText: {
    color: '#5d6979',
    fontSize: 14,
  },
  row: {
    borderColor: '#d8dee8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowCompleted: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rowMeta: {
    color: '#5d6979',
    fontSize: 12,
    marginLeft: 26,
  },
  rowTitle: {
    color: '#101828',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});
