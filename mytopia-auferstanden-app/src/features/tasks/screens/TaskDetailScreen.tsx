import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/src/core/session/SessionContext';
import {
  fetchMissions,
  submitGpsCompletion,
  submitQuizCompletion,
  type MissionListItem,
} from '@/src/features/tasks/data/missionRepository';
import { QuizRunner } from '@/src/features/tasks/components/QuizRunner';
import { GpsRunner } from '@/src/features/tasks/components/GpsRunner';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { Screen } from '@/src/shared/ui/Screen';
import { SectionCard } from '@/src/shared/ui/SectionCard';

export function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { user, selectedMode } = useSession();
  const completedMissions = useCompletedMissions(user?.id);
  const [mission, setMission] = useState<MissionListItem | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<Array<{ questionText: string; options: string[] }> | null>(null);
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

  if (isLoading) {
    return (
      <Screen title="Mission" subtitle="Wird geladen…">
        <SectionCard title="Laden">
          <Text style={styles.body}>Mission wird geladen…</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Fehler" subtitle="Mission konnte nicht geladen werden.">
        <SectionCard title="Fehler">
          <Text style={styles.errorText}>{error}</Text>
        </SectionCard>
      </Screen>
    );
  }

  if (!mission) {
    return (
      <Screen title="Nicht gefunden" subtitle="Diese Mission existiert nicht.">
        <SectionCard title="Unbekannte Mission">
          <Text style={styles.body}>Mission-ID: {String(taskId)}</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen title={mission.title} subtitle={`${mission.points} Punkte · ${mission.kind === 'quiz' ? '🧠 Quiz' : '📍 GPS'}`}>
      {mission.description ? (
        <SectionCard title="Beschreibung">
          <Text style={styles.body}>{mission.description}</Text>
        </SectionCard>
      ) : null}

      {completedMissions.includes(mission._id) ? (
        <SectionCard title="Bereits abgeschlossen">
          <Text style={styles.body}>Du hast diese Mission bereits erfolgreich beendet.</Text>
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
      ) : mission.kind === 'gps' && mission.gpsConfig ? (
        <GpsRunner
          missionId={mission._id}
          onComplete={handleGpsComplete}
          target={mission.gpsConfig}
        />
      ) : mission.kind === 'gps' ? (
        <SectionCard title="GPS-Check-in">
          <Text style={styles.body}>GPS-Konfiguration fehlt für diese Mission.</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Details">
        <View style={styles.row}>
          <Text style={styles.label}>Mission-ID</Text>
          <Text style={styles.value}>{mission._id}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Art</Text>
          <Text style={styles.value}>{mission.kind}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Punkte</Text>
          <Text style={styles.value}>{mission.points}</Text>
        </View>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#a12b2b',
    fontSize: 14,
    lineHeight: 20,
  },
  infoText: {
    color: '#5d6979',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  label: {
    color: '#5d6979',
    flex: 1,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
  },
  value: {
    color: '#101828',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
