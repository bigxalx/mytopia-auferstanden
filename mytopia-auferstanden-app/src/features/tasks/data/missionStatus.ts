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
  if (submissionState?.status === 'approved') {
    return 'completed';
  }

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

export function formatMissionCountdown(expiresAt?: string, now = Date.now()): string | null {
  if (!expiresAt) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  const remainingMs = expiresAtMs - now;
  if (remainingMs <= 0) {
    return 'Abgelaufen';
  }

  const totalMinutes = Math.max(1, Math.floor(remainingMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) {
      return `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} ${hours} Std.`;
    }

    return `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  }

  if (hours > 0) {
    if (minutes > 0) {
      return `Noch ${hours} Std. ${minutes} Min.`;
    }

    return `Noch ${hours} Std.`;
  }

  return `Noch ${minutes} Min.`;
}
