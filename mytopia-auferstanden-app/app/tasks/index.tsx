import { useEffect, useState } from 'react';
import { Link, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/src/shared/ui/theme';
import {
  fetchMissions,
  getCachedMissions,
  type MissionListItem,
} from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { getMissionLifecycleStatus } from '@/src/features/tasks/data/missionStatus';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { useSession } from '@/src/core/session/SessionContext';
import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

const KIND_EMOJI: Record<string, string> = {
  quiz: '🧠',
  gps: '📍',
  text: '📝',
  photo: '📸',
};
const KIND_LABEL: Record<string, string> = {
  quiz: 'Quiz',
  gps: 'GPS',
  text: 'Text',
  photo: 'Foto',
};

export default function TasksScreen() {
  const { user, selectedMode } = useSession();
  const insets = useSafeAreaInsets();
  const completedMissions = useCompletedMissions(user?.id, selectedMode);
  const submissionStates = useMissionSubmissionStates(user?.id, selectedMode);
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [error, setError] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const bottomPadding = Math.max(insets.bottom, 20);

  useEffect(() => {
    let active = true;
    const cached = getCachedMissions(selectedMode);
    setError(null);

    if (cached) {
      setMissions(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    async function load() {
      try {
        const result = await fetchMissions({ mode: selectedMode });
        if (active) {
          setError(null);
          setMissions(result);
        }
      } catch (err) {
        if (active && !cached) {
          setError(err instanceof Error ? err.message : 'Failed to load missions.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [selectedMode]);

  // Categorize missions
  const activeMissions: MissionListItem[] = [];
  const doneMissions: { mission: MissionListItem; status: 'completed' | 'expired' | 'pending' | 'rejected' }[] = [];

  for (const mission of missions) {
    const status = getMissionLifecycleStatus(mission, completedMissions, submissionStates);

    if (status === 'completed' || status === 'pending' || status === 'expired') {
      doneMissions.push({ mission, status });
    } else if (status === 'rejected') {
      // Rejected missions show as active so the user can re-attempt
      activeMissions.push(mission);
    } else {
      activeMissions.push(mission);
    }
  }

  return (
    <>
      <Stack.Screen
        options={createNativeTabStackOptions({
          title: 'Missionen',
          largeTitle: false,
        })}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
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
          <>
            {/* Active missions */}
            {activeMissions.length > 0 && (
              <SectionCard title="Verfügbare Missionen">
                {activeMissions.map((mission) => {
                  const isRejected = submissionStates[mission._id]?.status === 'rejected';
                  return (
                    <Link asChild href={`/(modals)/tasks/${mission._id}`} key={mission._id}>
                      <Pressable
                        style={[
                          styles.row,
                          isRejected ? styles.rowRejected : null,
                        ]}
                      >
                        <View style={styles.rowHeader}>
                          <Text style={styles.kindBadge}>
                            {KIND_EMOJI[mission.kind] ?? '❓'}
                          </Text>
                          <Text style={styles.rowTitle}>
                            {mission.title} {isRejected ? '❌' : ''}
                          </Text>
                        </View>
                        <Text style={styles.rowMeta}>
                          {KIND_LABEL[mission.kind] ?? mission.kind} · {mission.points} Punkte
                          {isRejected ? ' · Nicht bestätigt – erneut versuchen' : ''}
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

            {activeMissions.length === 0 && doneMissions.length > 0 && (
              <SectionCard title="Alle erledigt! 🎉">
                <Text style={styles.body}>
                  Du hast alle verfügbaren Missionen abgeschlossen. Schau später noch mal vorbei!
                </Text>
              </SectionCard>
            )}

            {/* Completed / pending missions — collapsible */}
            {doneMissions.length > 0 && (
              <SectionCard title="">
                <Pressable
                  onPress={() => setCompletedExpanded((v) => !v)}
                  style={styles.accordionHeader}
                >
                  <Text style={styles.accordionTitle}>
                    Abgeschlossene Missionen ({doneMissions.length})
                  </Text>
                  <Text style={styles.accordionChevron}>
                    {completedExpanded ? '▲' : '▼'}
                  </Text>
                </Pressable>

                {completedExpanded &&
                  doneMissions.map(({ mission, status }) => (
                    <Link asChild href={`/(modals)/tasks/${mission._id}`} key={mission._id}>
                      <Pressable
                        disabled
                        style={[
                          styles.row,
                          status === 'completed' ? styles.rowSuccess : null,
                          status === 'pending' ? styles.rowPending : null,
                        ]}
                      >
                        <View style={styles.rowHeader}>
                          <Text style={styles.kindBadge}>
                            {status === 'completed' ? '✅' : status === 'expired' ? '⌛' : '⏳'}
                          </Text>
                          <Text
                            style={[
                              styles.rowTitle,
                              styles.rowTitleDone,
                            ]}
                          >
                            {mission.title}
                          </Text>
                        </View>
                        <Text style={styles.rowMeta}>
                          {KIND_LABEL[mission.kind] ?? mission.kind} · {mission.points} Punkte
                          {status === 'completed'
                            ? ' · Abgeschlossen'
                            : status === 'expired'
                              ? ' · Abgelaufen'
                              : ' · Wird überprüft'}
                        </Text>
                      </Pressable>
                    </Link>
                  ))}
              </SectionCard>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  accordionChevron: {
    color: theme.colors.cardTextMuted,
    fontSize: 14,
  },
  accordionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  accordionTitle: {
    color: theme.colors.cardTextHeading,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    textTransform: 'uppercase',
  },
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
  rowPending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  rowRejected: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
  },
  rowSuccess: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.successBorder,
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
  rowTitleDone: {
    color: theme.colors.cardTextMuted,
  },
  scrollView: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
  },
});
