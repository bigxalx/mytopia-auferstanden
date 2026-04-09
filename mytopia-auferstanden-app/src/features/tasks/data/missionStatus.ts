import type { MissionListItem } from '@/src/features/tasks/data/missionRepository';
import type { MissionSubmissionState } from '@/src/features/tasks/data/useMissionSubmissionStates';

export type MissionLifecycleStatus = 'available' | 'completed' | 'pending' | 'rejected' | 'expired';

const deadlineFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function isMissionExpired(
  mission: Pick<MissionListItem, 'expiresAt'>,
  now = Date.now(),
): boolean {
  if (!mission.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(mission.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function getMissionLifecycleStatus(
  mission: MissionListItem,
  completedMissionIds: string[],
  submissionStates: Record<string, MissionSubmissionState>,
  now = Date.now(),
): MissionLifecycleStatus {
  if (completedMissionIds.includes(mission._id)) {
    return 'completed';
  }

  const submissionState = submissionStates[mission._id];
  if (submissionState?.status === 'pending') {
    return 'pending';
  }

  if (submissionState?.status === 'rejected') {
    return 'rejected';
  }

  if (isMissionExpired(mission, now)) {
    return 'expired';
  }

  return 'available';
}

export function formatMissionDeadline(expiresAt?: string): string {
  if (!expiresAt) {
    return 'Keine Deadline';
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unbekannte Deadline';
  }

  return deadlineFormatter.format(parsed);
}
