import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';

import { useSession } from '@/src/core/session/SessionContext';
import { theme } from '@/src/shared/ui/theme';
import {
  fetchMissions,
  submitGpsCompletion,
  submitQuizCompletion,
  submitTextMission,
  submitPhotoMission,
  type MissionListItem,
  MISSION_KIND_METADATA,
} from '@/src/features/tasks/data/missionRepository';
import { QuizRunner } from '@/src/features/tasks/components/QuizRunner';
import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { TextRunner } from '@/src/features/tasks/components/TextRunner';
import { PhotoRunner } from '@/src/features/tasks/components/PhotoRunner';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';
import { createNativeTabStackOptions } from '@/src/shared/navigation/nativeTabStackOptions';

export default function TaskDetailScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { user, selectedMode } = useSession();
  const completedMissions = useCompletedMissions(user?.id);
  const submissionStates = useMissionSubmissionStates(user?.id);
  const [mission, setMission] = useState<MissionListItem | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<{ questionText: string; options: string[] }[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const missions = await fetchMissions({ mode: selectedMode });
        if (!active) return;

        const found = missions.find((m) => m._id === taskId);
        setMission(found ?? null);

        if (found?.kind === 'quiz' && found.questions) {
          setQuizQuestions(found.questions);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load mission.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [taskId, selectedMode]);

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
        <Stack.Screen
          options={createNativeTabStackOptions({
            title: 'Mission',
            largeTitle: false,
          })}
        />
        <SectionCard title="Laden">
          <Text style={styles.body}>Mission wird geladen…</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Fehler" subtitle="Mission konnte nicht geladen werden." headerShown={false}>
        <Stack.Screen
          options={createNativeTabStackOptions({
            title: 'Mission',
            largeTitle: false,
          })}
        />
        <SectionCard title="Fehler">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (!mission) {
    return (
      <Screen title="Nicht gefunden" subtitle="Diese Mission existiert nicht." headerShown={false}>
        <Stack.Screen
          options={createNativeTabStackOptions({
            title: 'Mission',
            largeTitle: false,
          })}
        />
        <SectionCard title="Unbekannte Mission">
          <Text style={styles.body}>Mission-ID: {String(taskId)}</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen
      title="Mission"
      subtitle={`${mission.points} Punkte · ${MISSION_KIND_METADATA[mission.kind] ? `${MISSION_KIND_METADATA[mission.kind].emoji} ${MISSION_KIND_METADATA[mission.kind].label}` : '❓'}`}
      headerShown={false}
    >
      <Stack.Screen
        options={createNativeTabStackOptions({
          title: 'Mission',
          largeTitle: false,
        })}
      />

      <SectionCard title={mission.title}>
        <Text style={styles.type}>{MISSION_KIND_METADATA[mission.kind]?.label ?? mission.kind}</Text>
        {mission.imageUrl ? (
          <Image
            source={{ uri: mission.imageUrl }}
            style={styles.image}
            contentFit="cover"
          />
        ) : null}
        {mission.description ? (
          <Text style={styles.body}>{mission.description}</Text>
        ) : null}
      </SectionCard>

      {completedMissions.includes(mission._id) ? (
        <SectionCard title="Abgeschlossen">
          <Text style={styles.body}>Du hast diese Aufgabe erfolgreich abgeschlossen.</Text>
        </SectionCard>
      ) : submissionStates[mission._id]?.status === 'pending' ? (
        <SectionCard title="Wird überprüft">
          <Text style={styles.body}>Dein Beitrag wurde eingereicht und wird gerade von uns geprüft. Sobald er freigegeben ist, erhältst du deine Punkte!</Text>
        </SectionCard>
      ) : submissionStates[mission._id]?.status === 'rejected' ? (
        <SectionCard title="Abgeschlossen">
          <Text style={styles.body}>
            Du hast diese Aufgabe leider nicht erfolgreich abgeschlossen.
            {submissionStates[mission._id]?.moderatorNote ? `\n\nHinweis: ${submissionStates[mission._id]?.moderatorNote}` : ''}
          </Text>
        </SectionCard>
      ) : mission.kind === 'quiz' && quizQuestions ? (
        <QuizRunner
          missionId={mission._id}
          missionTitle={mission.title}
          onComplete={handleQuizComplete}
          questions={quizQuestions}
        />
      ) : mission.kind === 'quiz' ? (
        <SectionCard title="Quiz">
          <Text style={styles.body}>
            Dieses Quiz hat {mission.questionCount ?? '?'} Fragen.
          </Text>
          <Text style={styles.infoText}>
            Quiz-Laufzeit wird mit dediziertem Endpunkt verbunden.
          </Text>
        </SectionCard>
      ) : mission.kind === 'gps' &&
        mission.gpsConfig &&
        typeof mission.gpsConfig.latitude === 'number' &&
        typeof mission.gpsConfig.longitude === 'number' ? (
        <GpsRunner
          missionId={mission._id}
          onComplete={handleGpsComplete}
          target={mission.gpsConfig}
        />
      ) : mission.kind === 'gps' ? (
        <SectionCard title="GPS-Check-in">
          <Text style={styles.body}>GPS-Konfiguration fehlt für diese Mission.</Text>
        </SectionCard>
      ) : mission.kind === 'text' ? (
        <TextRunner
          onComplete={handleTextComplete}
        />
      ) : mission.kind === 'photo' ? (
        <PhotoRunner
          missionId={mission._id}
          onComplete={handlePhotoComplete}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  type: {
    color: theme.colors.cardTextMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 8,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: theme.colors.errorText,
    fontSize: 14,
    lineHeight: 20,
  },
  infoText: {
    color: theme.colors.cardTextMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  label: {
    color: theme.colors.cardTextSecondary,
    flex: 1,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
