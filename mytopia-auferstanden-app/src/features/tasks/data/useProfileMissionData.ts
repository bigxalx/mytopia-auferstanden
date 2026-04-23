import { useEffect, useMemo, useState } from 'react';

import { type AppMode } from '@/src/core/session/appMode';
import {
  fetchMissions,
  fetchSettings,
  getCachedMissions,
  type CustomAchievementSummary,
  type MissionListItem,
} from '@/src/features/tasks/data/missionRepository';
import {
  getMissionLifecycleStatus,
  type MissionLifecycleStatus,
} from '@/src/features/tasks/data/missionStatus';
import { useCompletedMissions } from '@/src/features/tasks/data/useCompletedMissions';
import { useMissionSubmissionStates } from '@/src/features/tasks/data/useMissionSubmissionStates';
import {
  useMissionSubmissions,
  type MissionSubmissionRecord,
} from '@/src/features/tasks/data/useMissionSubmissions';

export type ProfileMissionOverviewItem = {
  earnedPoints: number | null;
  mission: MissionListItem;
  submission: MissionSubmissionRecord | null;
  status: MissionLifecycleStatus;
};

export type ProfileLogbookItem = {
  createdAtMs: number;
  id: string;
  missionId: string;
  missionTitle: string;
  points: number;
  submission: MissionSubmissionRecord;
};

export type ProfileBadgeItem = CustomAchievementSummary & {
  awardCount: number;
  awards: {
    awardedAtMs: number;
    missionId: string;
    missionTitle: string;
    points: number;
  }[];
  latestAwardedAtMs: number;
};

export function useProfileMissionData(
  uid: string | undefined,
  mode: AppMode,
  refreshTrigger?: number,
) {
  const completedMissionIds = useCompletedMissions(uid, mode, refreshTrigger);
  const submissionStates = useMissionSubmissionStates(uid, mode, refreshTrigger);
  const submissions = useMissionSubmissions(uid, mode, refreshTrigger);
  const [missions, setMissions] = useState<MissionListItem[]>(() => getCachedMissions(mode) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedMissions(mode));
  const [error, setError] = useState<string | null>(null);
  const [streakThreshold, setStreakThreshold] = useState(3);

  useEffect(() => {
    let active = true;
    const cached = getCachedMissions(mode);
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
        const nextMissions = await fetchMissions({ mode });
        if (!active) {
          return;
        }

        setError(null);
        setMissions(nextMissions);
      } catch (err) {
        if (active && !cached) {
          setError(err instanceof Error ? err.message : 'Missionen konnten nicht geladen werden.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [mode, refreshTrigger]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const settings = await fetchSettings(mode);
        if (!active) {
          return;
        }

        setStreakThreshold(
          typeof settings.streakRequiredCompletions === 'number' && Number.isFinite(settings.streakRequiredCompletions)
            ? Math.max(1, Math.round(settings.streakRequiredCompletions))
            : 3,
        );
      } catch (err) {
        console.warn('[useProfileMissionData] Failed to load settings:', err);
        if (active) {
          setStreakThreshold(3);
        }
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, [mode, refreshTrigger]);

  const latestSubmissionByMissionId = useMemo(() => {
    const nextMap = new Map<string, MissionSubmissionRecord>();

    submissions.forEach((submission) => {
      const existing = nextMap.get(submission.sourceId);
      const candidateTime = submission.resolvedAtMs ?? submission.createdAtMs;
      const existingTime = existing ? existing.resolvedAtMs ?? existing.createdAtMs : -1;

      if (!existing || candidateTime > existingTime) {
        nextMap.set(submission.sourceId, submission);
      }
    });

    return nextMap;
  }, [submissions]);

  const overviewItems = useMemo<ProfileMissionOverviewItem[]>(
    () =>
      missions.map((mission) => {
        const submission = latestSubmissionByMissionId.get(mission._id) ?? null;
        return {
          earnedPoints: submission?.earnedPoints ?? submission?.rewardBreakdown?.totalPoints ?? null,
          mission,
          submission,
          status: getMissionLifecycleStatus(mission, completedMissionIds, submissionStates),
        };
      }),
    [completedMissionIds, latestSubmissionByMissionId, missions, submissionStates],
  );

  const activeMissions = overviewItems.filter((item) => item.status === 'available');
  const pendingMissions = overviewItems.filter((item) => item.status === 'pending');
  const completedMissions = overviewItems.filter(
    (item) => item.status === 'completed' || item.status === 'rejected' || item.status === 'expired',
  );

  const logbookEntries = useMemo<ProfileLogbookItem[]>(() => {
    const approvedByMissionId = new Map<string, MissionSubmissionRecord>();

    submissions.forEach((submission) => {
      if (submission.status !== 'approved') {
        return;
      }

      const existing = approvedByMissionId.get(submission.sourceId);
      const candidateTime = submission.resolvedAtMs ?? submission.createdAtMs;
      const existingTime = existing ? existing.resolvedAtMs ?? existing.createdAtMs : -1;

      if (!existing || candidateTime > existingTime) {
        approvedByMissionId.set(submission.sourceId, submission);
      }
    });

    return [...approvedByMissionId.values()]
      .map((submission) => ({
        createdAtMs: submission.resolvedAtMs ?? submission.createdAtMs,
        id: submission.id,
        missionId: submission.sourceId,
        missionTitle: submission.missionTitle,
        points:
          submission.earnedPoints ??
          submission.awardedPoints ??
          submission.rewardBreakdown?.totalPoints ??
          0,
        submission,
      }))
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }, [submissions]);

  const badges = useMemo<ProfileBadgeItem[]>(() => {
    const badgeMap = new Map<string, ProfileBadgeItem>();

    logbookEntries.forEach((entry) => {
      const awardedAtMs = entry.createdAtMs;
      const customAchievements = entry.submission.rewardBreakdown?.customAchievements ?? [];

      customAchievements.forEach((achievement) => {
        const existing = badgeMap.get(achievement.id);

        if (!existing) {
          badgeMap.set(achievement.id, {
            ...achievement,
            awardCount: 1,
            awards: [{
              awardedAtMs,
              missionId: entry.missionId,
              missionTitle: entry.missionTitle,
              points: entry.points,
            }],
            latestAwardedAtMs: awardedAtMs,
          });
          return;
        }

        existing.awardCount += 1;
        existing.awards.push({
          awardedAtMs,
          missionId: entry.missionId,
          missionTitle: entry.missionTitle,
          points: entry.points,
        });
        existing.latestAwardedAtMs = Math.max(existing.latestAwardedAtMs, awardedAtMs);
      });
    });

    return [...badgeMap.values()]
      .map((badge) => ({
        ...badge,
        awards: [...badge.awards].sort((left, right) => right.awardedAtMs - left.awardedAtMs),
      }))
      .sort(
        (left, right) => right.latestAwardedAtMs - left.latestAwardedAtMs || left.title.localeCompare(right.title, 'de'),
      );
  }, [logbookEntries]);

  const totalPoints = logbookEntries.reduce((sum, entry) => sum + Math.max(0, entry.points), 0);

  const streakCount = useMemo(() => {
    const resolvedItems = overviewItems
      .filter((item) => item.status !== 'available' && item.status !== 'pending')
      .sort((left, right) => getOverviewItemRecencyMs(right) - getOverviewItemRecencyMs(left));
    let count = 0;

    for (const item of resolvedItems) {
      if (item.status === 'completed') {
        count += 1;
        continue;
      }

      break;
    }

    return count;
  }, [overviewItems]);

  return {
    activeMissions,
    badges,
    completedMissions,
    error,
    isLoading,
    logbookEntries,
    missions,
    overviewItems,
    pendingMissions,
    streakCount,
    streakThreshold,
    totalPoints,
  };
}

function getOverviewItemRecencyMs(item: ProfileMissionOverviewItem) {
  if (item.submission?.resolvedAtMs) {
    return item.submission.resolvedAtMs;
  }

  if (item.submission?.createdAtMs) {
    return item.submission.createdAtMs;
  }

  const expiresAtMs = item.mission.expiresAt ? Date.parse(item.mission.expiresAt) : NaN;
  return Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
}
