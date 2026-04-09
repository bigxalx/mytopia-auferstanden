import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/shared/ui/theme';

import { useNarrativeSignal } from '@/src/features/feed/data/NarrativeSignalContext';
import {
  fetchMissions,
  getCachedMissions,
  type MissionListItem,
  MISSION_KIND_METADATA,
} from '@/src/features/tasks/data/missionRepository';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { getMissionLifecycleStatus } from '@/src/features/tasks/data/missionStatus';
import { SectionCard } from '@/src/shared/ui/SectionCard';

type MissionsCardProps = {
  userId?: string;
  mode: 'production' | 'dev';
  refreshTrigger?: number;
  onRefreshComplete?: () => void;
};

export function MissionsCard({ userId, mode, refreshTrigger, onRefreshComplete }: MissionsCardProps) {
  const completedMissions = useCompletedMissions(userId, refreshTrigger);
  const submissionStates = useMissionSubmissionStates(userId, refreshTrigger);
  const { pulse } = useNarrativeSignal();
  
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(mode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(mode));
  const [error, setError] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = getCachedMissions(mode);
    setError(null);

    if (cached) {
      setMissions(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    async function load() {
      try {
        const result = await fetchMissions({ mode });
        if (active) {
          setError(null);
          setMissions(result);
        }
      } catch (err) {
        if (active && !cached) {
          setError(err instanceof Error ? err.message : 'Failed to load missions.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
          onRefreshComplete?.();
        }
      }
    }

    load();
    return () => { active = false; };
  }, [mode, onRefreshComplete, refreshTrigger, pulse?.token]);

  if (isLoading) {
    return (
      <SectionCard title="Missionen">
        <View style={styles.loadingContainer}>
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

  // Categorize
  const openMissions: MissionListItem[] = [];
  const pendingMissions: MissionListItem[] = [];
  const doneMissions: { mission: MissionListItem; status: 'completed' | 'expired' | 'rejected' }[] = [];

  for (const mission of missions) {
    const status = getMissionLifecycleStatus(mission, completedMissions, submissionStates);

    if (status === 'completed') {
      doneMissions.push({ mission, status });
    } else if (status === 'pending') {
      pendingMissions.push(mission);
    } else if (status === 'rejected' || status === 'expired') {
      doneMissions.push({ mission, status });
    } else {
      openMissions.push(mission);
    }
  }

  const hasMissions = openMissions.length > 0 || pendingMissions.length > 0 || doneMissions.length > 0;

  if (!hasMissions) {
    return (
      <SectionCard title="Missionen">
        <Text style={styles.body}>Keine Missionen verfügbar.</Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Missionen">
      <View style={styles.contentContainer}>
        <>
          {/* Open missions */}
          {openMissions.length > 0 && (
            <View style={styles.section}>
              {openMissions.map((mission) => (
                <Link asChild href={`/(modals)/tasks/${mission._id}`} key={mission._id}>
                  <Pressable style={styles.row}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.kindBadge}>{MISSION_KIND_METADATA[mission.kind]?.emoji ?? '❓'}</Text>
                      <Text style={styles.rowTitle}>{mission.title}</Text>
                    </View>
                    <Text style={styles.rowMeta}>
                      {MISSION_KIND_METADATA[mission.kind]?.label ?? mission.kind} · {mission.points} Punkte
                      {mission.kind === 'quiz' && mission.questionCount ? ` · ${mission.questionCount} Fragen` : ''}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}

          {/* Pending missions section */}
          {pendingMissions.length > 0 && (
            <View style={StyleSheet.flatten([styles.section, styles.borderTop])}>
              <>
                <Text style={styles.subHeader}>Eingereicht und in Prüfung</Text>
                {pendingMissions.map((mission) => (
                  <Link asChild href={`/(modals)/tasks/${mission._id}`} key={mission._id}>
                    <Pressable style={StyleSheet.flatten([styles.row, styles.rowPending])}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.statusEmoji}>⏳</Text>
                        <Text style={styles.rowTitle}>{mission.title}</Text>
                      </View>
                      <Text style={styles.rowMeta}>
                        {mission.points} Punkte · Wird überprüft
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </>
            </View>
          )}

          {/* Done missions section */}
          {doneMissions.length > 0 && (
            <View style={StyleSheet.flatten([styles.completedSection, styles.borderTop])}>
              <>
                <Pressable
                  onPress={() => setCompletedExpanded((v) => !v)}
                  style={styles.accordionHeader}
                >
                  <Text style={styles.accordionTitle}>
                    Abgeschlossen ({doneMissions.length})
                  </Text>
                  <Text style={styles.accordionChevron}>{completedExpanded ? '▲' : '▼'}</Text>
                </Pressable>

                {completedExpanded && (
                  <View style={styles.completedList}>
                    {doneMissions.map(({ mission, status }) => (
                      <Link asChild href={`/(modals)/tasks/${mission._id}`} key={mission._id}>
                        <Pressable
                          style={StyleSheet.flatten([
                            styles.row,
                            styles.rowSmall,
                            status === 'completed' ? styles.rowSuccess : styles.rowRejected,
                          ])}
                        >
                          <View style={styles.rowHeader}>
                          <Text style={styles.statusEmoji}>
                              {status === 'completed' ? '✅' : status === 'expired' ? '⌛' : '❌'}
                            </Text>
                            <Text style={StyleSheet.flatten([styles.rowTitle, styles.rowTitleDone])}>{mission.title}</Text>
                          </View>
                          <Text style={styles.rowMeta}>
                             {mission.points} Punkte · {status === 'completed' ? 'Erfolgreich' : status === 'expired' ? 'Abgelaufen' : 'Nicht bestätigt'}
                          </Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                )}
              </>
            </View>
          )}

          {openMissions.length === 0 && pendingMissions.length === 0 && doneMissions.length > 0 && !completedExpanded && (
            <View style={styles.allDoneContainer}>
              <Text style={styles.body}>Alle aktuellen Missionen bearbeitet! 🎉</Text>
            </View>
          )}
        </>
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: 12,
  },
  section: {
    gap: 10,
  },
  borderTop: {
    borderTopColor: theme.colors.cardBorder,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  completedSection: {
    marginTop: 4,
  },
  subHeader: {
    color: theme.colors.cardTextMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  accordionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  accordionTitle: {
    color: theme.colors.cardTextMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  accordionChevron: {
    color: theme.colors.cardTextMuted,
    fontSize: 12,
  },
  completedList: {
    gap: 8,
    marginTop: 10,
  },
  row: {
    borderColor: theme.colors.cardBorder,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowSmall: {
    padding: 8,
  },
  rowRejected: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorBorder,
  },
  rowSuccess: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.successBorder,
  },
  rowPending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rowTitle: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  rowTitleDone: {
    color: theme.colors.cardTextSecondary,
  },
  rowMeta: {
    color: theme.colors.cardTextSecondary,
    fontSize: 11,
    marginLeft: 26,
  },
  kindBadge: {
    fontSize: 18,
  },
  statusEmoji: {
    fontSize: 14,
  },
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
  },
  allDoneContainer: {
    paddingVertical: 8,
  },
});
