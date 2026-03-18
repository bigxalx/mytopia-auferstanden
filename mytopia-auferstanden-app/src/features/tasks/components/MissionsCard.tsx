import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

import { fetchMissions, type MissionListItem } from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import type { AppMode } from '@/src/core/session/appMode';

type MissionsCardProps = {
  userId?: string;
  mode: AppMode;
};

export function MissionsCard({ userId, mode }: MissionsCardProps) {
  const completedMissions = useCompletedMissions(userId);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await fetchMissions({ mode });
        if (active) setMissions(result);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load missions.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [mode]);

  if (isLoading) {
    return (
        <SectionCard title="Missionen">
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.colors.orange} />
          <Text style={styles.loadingText}>Laden…</Text>
        </View>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Missionen">
        <Text style={styles.errorText}>{error}</Text>
      </SectionCard>
    );
  }

  if (missions.length === 0) {
    return (
      <SectionCard title="Missionen">
        <Text style={styles.body}>Keine Missionen verfügbar.</Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Missionen">
      {missions.map((mission) => {
        const isCompleted = completedMissions.includes(mission._id);
        return (
          <Link asChild href={`/tasks/${mission._id}`} key={mission._id}>
            <Pressable style={[styles.row, isCompleted && styles.rowCompleted]}>
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
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
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
    color: theme.colors.cardTextSecondary,
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
