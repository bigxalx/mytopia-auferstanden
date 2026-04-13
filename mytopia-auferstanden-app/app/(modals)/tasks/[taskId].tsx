import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useSession } from '@/src/core/session/SessionContext';
import { theme } from '@/src/shared/ui/theme';
import {
  fetchMissions,
  getCachedMissions,
  submitGpsCompletion,
  submitPhotoMission,
  submitQuizCompletion,
  submitTextMission,
  type MissionListItem,
  MISSION_KIND_METADATA,
  type MissionKind,
} from '@/src/features/tasks/data/missionRepository';
import {
  formatMissionCountdown,
  formatMissionDeadline,
  getMissionLifecycleStatus,
  type MissionLifecycleStatus,
} from '@/src/features/tasks/data/missionStatus';
import { QuizRunner } from '@/src/features/tasks/components/QuizRunner';
import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { TextRunner } from '@/src/features/tasks/components/TextRunner';
import { PhotoRunner } from '@/src/features/tasks/components/PhotoRunner';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { useActiveMission } from '@/src/features/tasks/context/ActiveMissionContext';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { AppImage } from '@/src/shared/ui/AppImage';

export default function TaskDetailScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { user, selectedMode } = useSession();
  const { focusedMissionId, setFocus } = useActiveMission();
  const isFocused = focusedMissionId === taskId;
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(selectedMode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(selectedMode));
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const cached = getCachedMissions(selectedMode);
    setError(null);

    if (cached) {
      setMissions(cached);
      setIsLoading(false);
    } else {
      setMissions([]);
      setIsLoading(true);
    }

    async function load() {
      try {
        const nextMissions = await fetchMissions({ mode: selectedMode });
        if (!active) return;
        setError(null);
        setMissions(nextMissions);
      } catch (err) {
        if (!active || cached) return;
        setError(err instanceof Error ? err.message : 'Failed to load mission.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [selectedMode]);

  const mission = missions.find((candidate) => candidate._id === taskId) ?? null;
  const missionStatus = mission
    ? getMissionLifecycleStatus(mission, completedMissions, submissionStates)
    : null;
  const groupMissions = mission?.groupId
    ? missions
      .filter((candidate) => candidate.groupId === mission.groupId)
      .sort((left, right) => {
        const leftIsCurrent = left._id === mission._id;
        const rightIsCurrent = right._id === mission._id;

        if (leftIsCurrent === rightIsCurrent) {
          return left.title.localeCompare(right.title, 'de');
        }

        return leftIsCurrent ? 1 : -1;
      })
    : [];

  useEffect(() => {
    if (!mission?.expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, [mission?.expiresAt]);

  const handleQuizComplete = useCallback(
    async (answers: number[]) => {
      if (!mission) throw new Error('Mission not loaded.');
      const result = await submitQuizCompletion(mission._id, answers, selectedMode);
      return { correct: result.correct, earned: result.earned, total: result.total };
    },
    [mission, selectedMode]
  );

  const handleGpsComplete = useCallback(async () => {
    if (!mission) throw new Error('Mission not loaded.');
    const result = await submitGpsCompletion(mission._id, selectedMode);
    return { earned: result.earned };
  }, [mission, selectedMode]);

  const handleTextComplete = useCallback(async (text: string) => {
    if (!mission) throw new Error('Mission not loaded.');
    const result = await submitTextMission(mission._id, text, selectedMode);

    if (result.action === 'submitted') {
      Alert.alert('Erfolgreich', 'Dein Beitrag wurde eingereicht und wird geprüft.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } else {
      Alert.alert('Hinweis', 'Du hast diese Mission bereits eingereicht.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }

    return { action: result.action };
  }, [mission, selectedMode, router]);

  const handlePhotoComplete = useCallback(async (photoUri: string) => {
    if (!mission) throw new Error('Mission not loaded.');
    const result = await submitPhotoMission(mission._id, photoUri, selectedMode);

    if (result.action === 'submitted') {
      Alert.alert('Erfolgreich', 'Dein Foto wurde eingereicht und wird geprüft.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } else {
      Alert.alert('Hinweis', 'Du hast diese Mission bereits eingereicht.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }

    return { action: result.action };
  }, [mission, selectedMode, router]);

  if (isLoading) {
    return (
      <Screen title="Mission" subtitle="Wird geladen…" headerShown={false}>
        <SectionCard title="Laden">
          <Text style={styles.body}>Mission wird geladen…</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Fehler" subtitle="Mission konnte nicht geladen werden." headerShown={false}>
        <SectionCard title="Fehler">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (!mission || !missionStatus) {
    return (
      <Screen title="Nicht gefunden" subtitle="Diese Mission existiert nicht." headerShown={false}>
        <SectionCard title="Unbekannte Mission">
          <Text style={styles.body}>Mission-ID: {String(taskId)}</Text>
        </SectionCard>
      </Screen>
    );
  }

  const missionMeta = MISSION_KIND_METADATA[mission.kind];
  const statusText = getStatusText(missionStatus);
  const countdownText = formatMissionCountdown(mission.expiresAt, now);
  const missionTypeLabel = getMissionTypeLabel(mission.kind);
  const missionBody = renderMissionBody({
    handleGpsComplete,
    handlePhotoComplete,
    handleQuizComplete,
    handleTextComplete,
    mission,
    missionStatus,
  });

  return (
    <Screen
      title="Mission"
      subtitle={missionMeta ? `${missionMeta.emoji} ${missionMeta.label}` : 'Mission'}
      headerShown={false}
    >
      <SectionCard title={mission.title} titleStyle={styles.cardTitle}>
        <Text style={styles.type}>{missionTypeLabel}</Text>

        {mission.imageUrl ? (
          <AppImage
            uri={mission.imageUrl}
            style={styles.image}
            contentFit="cover"
          />
        ) : null}

        <Text style={styles.body}>
          {mission.description?.trim() || 'Für diese Mission gibt es keine zusätzliche Beschreibung.'}
        </Text>

        {missionBody ? (
          <>
            <View style={styles.divider} />
            <MissionHeadline>{mission.kind === 'gps' ? 'Zielgebiet' : 'Aufgabe'}</MissionHeadline>
            {missionBody}
          </>
        ) : null}

        {missionStatus === 'available' && (
          <Pressable
            style={[styles.startButton, isFocused && styles.startButtonActive]}
            onPress={async () => {
              if (isFocused) {
                 router.back();
                 return;
              }
              await setFocus(mission._id);
              router.back();
            }}
          >
            <Text style={styles.startButtonText}>
              {isFocused ? 'AKTIVE MISSION' : 'MISSION STARTEN'}
            </Text>
          </Pressable>
        )}
      </SectionCard>

      <View style={styles.infoCard}>
        <Text style={styles.pointsValue}>{mission.points} Punkte</Text>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>{statusText}</Text>
          {missionStatus === 'rejected' && submissionStates[mission._id]?.moderatorNote ? (
            <Text style={styles.infoMeta}>Hinweis: {submissionStates[mission._id]?.moderatorNote}</Text>
          ) : null}
        </View>

        {mission.expiresAt ? (
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Deadline</Text>
            <Text style={styles.infoValue}>{formatMissionDeadline(mission.expiresAt)}</Text>
            {countdownText ? <Text style={styles.infoMeta}>{countdownText}</Text> : null}
          </View>
        ) : null}

        {mission.groupId ? (
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>
              {mission.groupTitle ? `Sammelaufgabe: ${mission.groupTitle}` : 'Teil einer Sammelaufgabe'}
            </Text>
            <View style={styles.groupList}>
              {groupMissions.map((groupMission) => (
                <View key={groupMission._id} style={styles.groupRow}>
                  <GroupMissionIcon
                    status={resolveGroupMissionStatus(
                      groupMission,
                      mission,
                      completedMissions,
                      submissionStates
                    )}
                  />
                  <Text style={styles.groupTitle}>{groupMission.title}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function renderMissionBody({
  handleGpsComplete,
  handlePhotoComplete,
  handleQuizComplete,
  handleTextComplete,
  mission,
  missionStatus,
}: {
  handleGpsComplete: () => Promise<{ earned: number }>;
  handlePhotoComplete: (photoUri: string) => Promise<{ action: string }>;
  handleQuizComplete: (answers: number[]) => Promise<{ correct: number; earned: number; total: number }>;
  handleTextComplete: (text: string) => Promise<{ action: string }>;
  mission: MissionListItem;
  missionStatus: MissionLifecycleStatus;
}) {
  if (missionStatus !== 'available') {
    if (missionStatus === 'expired') {
      return <Text style={styles.body}>Diese Mission kann nicht mehr erledigt werden.</Text>;
    }

    return null;
  }

  if (mission.kind === 'quiz' && mission.questions) {
    return (
      <QuizRunner
        embedded
        missionId={mission._id}
        missionTitle={mission.title}
        onComplete={handleQuizComplete}
        questions={mission.questions}
      />
    );
  }

  if (mission.kind === 'quiz') {
    return (
      <Text style={styles.body}>
        Dieses Quiz enthält {mission.questionCount ?? '?'} Fragen.
      </Text>
    );
  }

  if (
    mission.kind === 'gps' &&
    mission.gpsConfig &&
    typeof mission.gpsConfig.latitude === 'number' &&
    typeof mission.gpsConfig.longitude === 'number'
  ) {
    return (
      <GpsRunner
        embedded
        missionId={mission._id}
        onComplete={handleGpsComplete}
        target={mission.gpsConfig}
      />
    );
  }

  if (mission.kind === 'gps') {
    return <Text style={styles.body}>GPS-Konfiguration fehlt für diese Mission.</Text>;
  }

  if (mission.kind === 'text') {
    return <TextRunner embedded onComplete={handleTextComplete} />;
  }

  if (mission.kind === 'photo') {
    return (
      <PhotoRunner
        embedded
        missionId={mission._id}
        onComplete={handlePhotoComplete}
      />
    );
  }

  return null;
}

function getStatusText(status: MissionLifecycleStatus) {
  if (status === 'completed') {
    return 'Du hast diese Aufgabe erfolgreich abgeschlossen.';
  }

  if (status === 'pending') {
    return 'Dein Beitrag wurde eingereicht und wird gerade geprüft. Sobald er freigegeben ist, erhältst du deine Punkte.';
  }

  if (status === 'rejected') {
    return 'Du hast diese Aufgabe leider nicht erfolgreich abgeschlossen.';
  }

  if (status === 'expired') {
    return 'Diese Mission ist abgelaufen und kann nicht mehr erledigt werden.';
  }

  return 'Diese Mission ist aktiv und kann jetzt bearbeitet werden.';
}

function getMissionTypeLabel(kind: MissionKind) {
  if (kind === 'gps') {
    return 'GPS-Aufgabe';
  }

  if (kind === 'photo') {
    return 'Foto-Aufgabe';
  }

  if (kind === 'text') {
    return 'Text-Aufgabe';
  }

  return 'Quiz-Aufgabe';
}

function resolveGroupMissionStatus(
  groupMission: MissionListItem,
  currentMission: MissionListItem,
  completedMissions: string[],
  submissionStates: Record<string, { moderatorNote?: string; status: 'approved' | 'draft' | 'pending' | 'rejected' }>,
): 'completed' | 'current' | 'failed' {
  if (groupMission._id === currentMission._id) {
    return 'current';
  }

  const status = getMissionLifecycleStatus(groupMission, completedMissions, submissionStates);
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'rejected' || status === 'expired') {
    return 'failed';
  }

  return 'current';
}

function MissionHeadline({ children }: { children: string }) {
  return <Text style={styles.headline}>{children}</Text>;
}

function GroupMissionIcon({ status }: { status: 'completed' | 'current' | 'failed' }) {
  if (status === 'completed') {
    return (
      <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
        <Path
          fill="#016AD3"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19 9.5C19 14.7467 14.7467 19 9.5 19C4.25329 19 0 14.7467 0 9.5C0 4.25329 4.25329 0 9.5 0C14.7467 0 19 4.25329 19 9.5ZM13.3288 6.62119C13.607 6.89943 13.607 7.35057 13.3288 7.62879L8.57878 12.3788C8.30053 12.657 7.84947 12.657 7.57119 12.3788L5.67119 10.4788C5.39294 10.2005 5.39294 9.74947 5.67119 9.47121C5.94943 9.19296 6.40057 9.19296 6.67881 9.47121L8.075 10.8673L10.1981 8.74428L12.3212 6.62119C12.5995 6.34294 13.0505 6.34294 13.3288 6.62119Z"
        />
      </Svg>
    );
  }

  if (status === 'failed') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" color="#9FCFE6" fill="none">
        <Path
          opacity="0.5"
          d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
          fill="currentColor"
        />
        <Path
          d="M8.96967 8.96967C9.26256 8.67678 9.73744 8.67678 10.0303 8.96967L12 10.9394L13.9697 8.96969C14.2626 8.6768 14.7374 8.6768 15.0303 8.96969C15.3232 9.26258 15.3232 9.73746 15.0303 10.0304L13.0607 12L15.0303 13.9696C15.3232 14.2625 15.3232 14.7374 15.0303 15.0303C14.7374 15.3232 14.2625 15.3232 13.9696 15.0303L12 13.0607L10.0304 15.0303C9.73746 15.3232 9.26258 15.3232 8.96969 15.0303C8.6768 14.7374 8.6768 14.2626 8.96969 13.9697L10.9394 12L8.96967 10.0303C8.67678 9.73744 8.67678 9.26256 8.96967 8.96967Z"
          fill="currentColor"
        />
      </Svg>
    );
  }

  return (
    <Svg width={13} height={18} viewBox="0 0 13 18" fill="none">
      <Path
        fill="#F67641"
        d="M0.625 0C0.970175 0 1.25 0.279825 1.25 0.625V2.16667L2.68389 1.87989C4.05933 1.6048 5.48508 1.7357 6.78742 2.25664L6.95717 2.32453C8.25808 2.84491 9.69 2.94209 11.0493 2.60225C11.6804 2.44449 12.2917 2.92178 12.2917 3.57224V9.71142C12.2917 10.2483 11.9263 10.7163 11.4053 10.8466L11.2267 10.8913C9.752 11.2599 8.19875 11.1545 6.78742 10.59C5.48508 10.069 4.05933 9.93817 2.68389 10.2133L1.25 10.5V17.2917C1.25 17.6368 0.970175 17.9167 0.625 17.9167C0.279825 17.9167 0 17.6368 0 17.2917V0.625C0 0.279825 0.279825 0 0.625 0Z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  cardTitle: {
    color: theme.colors.cardTextPrimary,
  },
  divider: {
    borderTopColor: theme.colors.cardBorder,
    borderTopWidth: 1,
    marginVertical: 4,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    lineHeight: 20,
  },
  groupList: {
    gap: 10,
  },
  groupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  groupTitle: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  headline: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    textTransform: 'uppercase',
  },
  image: {
    borderRadius: 12,
    height: 200,
    width: '100%',
  },
  infoBlock: {
    gap: 8,
  },
  infoCard: {
    backgroundColor: '#DDEAF8',
    borderRadius: 20,
    gap: 16,
    marginTop: 8,
    padding: 24,
  },
  infoLabel: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  infoMeta: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  infoValue: {
    color: theme.colors.cardTextPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  noteText: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  pointsValue: {
    ...theme.typography.h1,
    color: theme.colors.cardTextPrimary,
    marginBottom: 0,
    textAlign: 'left',
  },
  type: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: theme.colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  startButtonActive: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.orange,
  },
  startButtonText: {
    color: 'white',
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
