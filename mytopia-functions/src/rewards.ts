import { firestore } from './firebase.js';
import { sanityQuery } from './sanity.js';
import { V2_SCORE_EVENTS_COLLECTION_PATH, V2_SUBMISSIONS_COLLECTION_PATH, V2_USERS_COLLECTION_PATH } from './constants.js';
import {
  CustomAchievementDto,
  GroupBonusDto,
  MissionDto,
  MissionSettingsDto,
  NarrativeMode,
  RewardBreakdownDto,
  StreakSummaryDto,
  TimeBonusDto,
} from './types.js';

type GroupMissionDto = {
  _id: string;
  title: string;
};

type GroupRewardContext = {
  _id: string;
  completionBonusPoints?: number;
  missions?: GroupMissionDto[];
  title: string;
};

type RewardContext = {
  customAchievements: CustomAchievementDto[];
  group: GroupRewardContext | null;
  mission: MissionDto | null;
  settings: MissionSettingsDto | null;
};

type MissionReleaseInfo = {
  _id: string;
  effectiveReleaseAt?: string;
  expiresAt?: string;
};

type UserRewardHistory = {
  awardedGroupBonusIds: string[];
  rejectedAtMs: number[];
  successEventTimesMs: number[];
  successTimesByMissionId: Map<string, number>;
};

export type RewardComputationResult = {
  appliedGroupBonusId?: string;
  breakdown: RewardBreakdownDto;
  streakSummary: StreakSummaryDto;
};

const MISSION_REASON_SET = new Set(['quiz_completed', 'gps_completed', 'text_approved', 'photo_approved']);
const MISSION_SOURCE_TYPE_SET = new Set(['quiz', 'gps', 'text', 'photo']);

export async function computeRewardOutcome({
  awardAtMs,
  basePoints,
  customAchievementIds = [],
  missionId,
  mode,
  timeReferenceAtMs,
  uid,
}: {
  awardAtMs: number;
  basePoints: number;
  customAchievementIds?: string[];
  missionId: string;
  mode: NarrativeMode;
  timeReferenceAtMs?: number | null;
  uid: string;
}): Promise<RewardComputationResult> {
  const normalizedBasePoints = Number.isFinite(basePoints) ? Math.max(0, Math.round(basePoints)) : 0;
  const uniqueCustomAchievementIds = [...new Set(customAchievementIds.filter((value) => typeof value === 'string' && value.length > 0))];

  const context = await loadRewardContext({
    customAchievementIds: uniqueCustomAchievementIds,
    missionId,
    mode,
  });

  if (!context.mission) {
    throw new Error(`Missing reward context for mission ${missionId}.`);
  }

  const groupMissionIds = Array.isArray(context.group?.missions)
    ? context.group!.missions!.map((groupMission) => groupMission._id)
    : [];
  const releaseInfo = await loadMissionReleaseInfo({
    missionIds: [...new Set([missionId, ...groupMissionIds])],
    mode,
  });

  const userHistory = await loadUserRewardHistory(uid);
  const timeBonus = selectBestTimeBonus({
    awardAtMs,
    missionId,
    releaseInfo,
    timeBonuses: context.mission.timeBonuses,
    timeReferenceAtMs,
  });

  const priorBreakAtMs = await computeLatestBreakAtMs({
    awardAtMs,
    mode,
    rejectedAtMs: userHistory.rejectedAtMs,
    successTimesByMissionId: userHistory.successTimesByMissionId,
  });

  const successfulSinceLastBreak = userHistory.successEventTimesMs.filter((createdAtMs) => createdAtMs > priorBreakAtMs && createdAtMs < awardAtMs).length;
  const streakCount = successfulSinceLastBreak + 1;
  const configuredMultiplier = normalizeMultiplier(context.settings?.streakMultiplier);
  const threshold = normalizeThreshold(context.settings?.streakRequiredCompletions);
  const streakIsActive = configuredMultiplier > 1 && streakCount >= threshold;
  const streakBonusPoints = streakIsActive
    ? Math.max(0, Math.round(normalizedBasePoints * (configuredMultiplier - 1)))
    : 0;

  const groupBonus = resolveGroupBonus({
    awardAtMs,
    awardedGroupBonusIds: userHistory.awardedGroupBonusIds,
    group: context.group,
    missionId,
    releaseInfo,
    successTimesByMissionId: userHistory.successTimesByMissionId,
  });

  const customAchievements = context.customAchievements;
  const customAchievementBonusPoints = customAchievements.reduce((sum, item) => sum + Math.max(0, item.bonusPoints), 0);
  const totalPoints =
    normalizedBasePoints +
    streakBonusPoints +
    (timeBonus?.bonusPoints ?? 0) +
    customAchievementBonusPoints +
    (groupBonus?.bonusPoints ?? 0);

  return {
    ...(groupBonus ? { appliedGroupBonusId: groupBonus.groupId } : {}),
    breakdown: {
      basePoints: normalizedBasePoints,
      ...(customAchievements.length > 0 ? { customAchievements } : {}),
      ...(groupBonus ? { groupBonus } : {}),
      streakBonusPoints,
      ...(timeBonus ? { timeBonus } : {}),
      totalPoints,
    },
    streakSummary: {
      count: streakCount,
      isActive: streakIsActive,
      multiplier: streakIsActive ? configuredMultiplier : 1,
    },
  };
}

export async function readExistingRewardOutcome({
  eventId,
}: {
  eventId: string;
}): Promise<{ breakdown?: RewardBreakdownDto; streakSummary?: StreakSummaryDto; totalPoints: number }> {
  const doc = await firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).doc(eventId).get();
  const data = doc.data() as Record<string, any> | undefined;
  const rewardBreakdown = asRewardBreakdown(data?.metadata?.rewardBreakdown);
  const streakSummary = asStreakSummary(data?.metadata?.streakSummary);
  const totalPoints =
    rewardBreakdown?.totalPoints ??
    (typeof data?.delta === 'number' && Number.isFinite(data.delta) ? Math.round(data.delta) : 0);

  return {
    ...(rewardBreakdown ? { breakdown: rewardBreakdown } : {}),
    ...(streakSummary ? { streakSummary } : {}),
    totalPoints,
  };
}

export async function loadMissionReleaseInfo({
  missionIds,
  mode,
}: {
  missionIds: string[];
  mode: NarrativeMode;
}): Promise<Map<string, MissionReleaseInfo>> {
  if (missionIds.length === 0) {
    return new Map();
  }

  const query = `*[_type == "mission" && _id in $missionIds && !(_id in path("drafts.**"))]{
    _id,
    expiresAt,
    "firstBundle": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && references(^._id)]
      | order(coalesce(releaseAt, _updatedAt) asc)[0]{
        "effectiveReleaseAt": coalesce(releaseAt, _updatedAt)
      }
  }`;
  const missions = await sanityQuery<Array<{ _id: string; expiresAt?: string; firstBundle?: { effectiveReleaseAt?: string } }>>(query, { missionIds }, mode);

  return new Map(
    missions.map((mission) => [
      mission._id,
      {
        _id: mission._id,
        ...(typeof mission.expiresAt === 'string' ? { expiresAt: mission.expiresAt } : {}),
        ...(typeof mission.firstBundle?.effectiveReleaseAt === 'string'
          ? { effectiveReleaseAt: mission.firstBundle.effectiveReleaseAt }
          : {}),
      },
    ])
  );
}

export function buildUserRewardPatch({
  appliedGroupBonusId,
  existingAwardedGroupBonusIds,
  streakSummary,
  uid,
}: {
  appliedGroupBonusId?: string;
  existingAwardedGroupBonusIds: string[];
  streakSummary: StreakSummaryDto;
  uid: string;
}) {
  const awardedGroupBonusIds = [...existingAwardedGroupBonusIds];
  if (appliedGroupBonusId && !awardedGroupBonusIds.includes(appliedGroupBonusId)) {
    awardedGroupBonusIds.push(appliedGroupBonusId);
  }

  return {
    ...(awardedGroupBonusIds.length > 0 ? { awardedGroupBonusIds } : {}),
    streakCount: streakSummary.count,
    streakLastUpdatedAt: new Date().toISOString(),
    streakMultiplierCurrent: streakSummary.multiplier,
    uid,
  };
}

export async function loadPublishedCustomAchievements(mode: NarrativeMode): Promise<CustomAchievementDto[]> {
  const query = `*[_type == "customAchievement" && !(_id in path("drafts.**"))] | order(title asc){
    "id": _id,
    title,
    description,
    bonusPoints
  }`;
  return sanityQuery<CustomAchievementDto[]>(query, {}, mode);
}

async function loadRewardContext({
  customAchievementIds,
  missionId,
  mode,
}: {
  customAchievementIds: string[];
  missionId: string;
  mode: NarrativeMode;
}): Promise<RewardContext> {
  const query = `{
    "mission": *[_type == "mission" && _id == $missionId && !(_id in path("drafts.**"))][0]{
      _id,
      title,
      kind,
      points,
      expiresAt,
      "timeBonuses": timeBonuses[]{
        minutesLimit,
        bonusPoints
      },
      "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
      "groupTitle": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].title,
      "groupCompletionBonusPoints": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].completionBonusPoints
    },
    "group": *[_type == "sammelaufgabe" && active == true && references($missionId)][0]{
      _id,
      title,
      completionBonusPoints,
      "missions": missions[]->{
        _id,
        title
      }
    },
    "settings": *[_type == "siteSettings" && !(_id in path("drafts.**"))][0]{
      defaultQuizFeedbackCorrect,
      defaultQuizFeedbackIncorrect,
      streakRequiredCompletions,
      streakMultiplier
    },
    "customAchievements": *[_type == "customAchievement" && _id in $customAchievementIds && !(_id in path("drafts.**"))] | order(title asc){
      "id": _id,
      title,
      description,
      bonusPoints
    }
  }`;

  return sanityQuery<RewardContext>(query, { customAchievementIds, missionId }, mode);
}

async function loadUserRewardHistory(uid: string): Promise<UserRewardHistory> {
  const [userSnapshot, scoreEventsSnapshot, submissionsSnapshot] = await Promise.all([
    firestore.collection(V2_USERS_COLLECTION_PATH).doc(uid).get(),
    firestore.collection(V2_SCORE_EVENTS_COLLECTION_PATH).where('uid', '==', uid).get(),
    firestore.collection(V2_SUBMISSIONS_COLLECTION_PATH).where('ownerUid', '==', uid).get(),
  ]);

  const userData = (userSnapshot.data() as Record<string, any> | undefined) ?? {};
  const awardedGroupBonusIds = Array.isArray(userData.awardedGroupBonusIds)
    ? userData.awardedGroupBonusIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  const successTimesByMissionId = new Map<string, number>();
  const successEventTimesMs: number[] = [];

  scoreEventsSnapshot.forEach((doc) => {
    const data = doc.data() as Record<string, any>;
    if (!MISSION_REASON_SET.has(String(data.reason)) || !MISSION_SOURCE_TYPE_SET.has(String(data.sourceType))) {
      return;
    }

    if (typeof data.sourceId !== 'string' || data.sourceId.length === 0) {
      return;
    }

    const createdAtMs = toMillis(data.createdAt);
    if (createdAtMs === null) {
      return;
    }

    successEventTimesMs.push(createdAtMs);
    const previous = successTimesByMissionId.get(data.sourceId);
    if (previous === undefined || createdAtMs < previous) {
      successTimesByMissionId.set(data.sourceId, createdAtMs);
    }
  });

  const rejectedAtMs: number[] = [];
  submissionsSnapshot.forEach((doc) => {
    const data = doc.data() as Record<string, any>;
    if (data.status !== 'rejected') {
      return;
    }

    const reviewedAtMs = toMillis(data.reviewedAt);
    if (reviewedAtMs !== null) {
      rejectedAtMs.push(reviewedAtMs);
    }
  });

  return {
    awardedGroupBonusIds,
    rejectedAtMs,
    successEventTimesMs,
    successTimesByMissionId,
  };
}

function selectBestTimeBonus({
  awardAtMs,
  missionId,
  releaseInfo,
  timeBonuses,
  timeReferenceAtMs,
}: {
  awardAtMs: number;
  missionId: string;
  releaseInfo: Map<string, MissionReleaseInfo>;
  timeBonuses?: TimeBonusDto[];
  timeReferenceAtMs?: number | null;
}): TimeBonusDto | undefined {
  if (!Array.isArray(timeBonuses) || timeBonuses.length === 0 || timeReferenceAtMs === null || timeReferenceAtMs === undefined) {
    return undefined;
  }

  const missionReleaseAtMs = toMillis(releaseInfo.get(missionId)?.effectiveReleaseAt);
  if (missionReleaseAtMs === null) {
    return undefined;
  }

  const effectiveTimeReferenceAtMs = Math.min(awardAtMs, timeReferenceAtMs);
  const elapsedMinutes = Math.max(0, (effectiveTimeReferenceAtMs - missionReleaseAtMs) / 60000);

  return [...timeBonuses]
    .filter((bonus) => Number.isFinite(bonus.minutesLimit) && Number.isFinite(bonus.bonusPoints))
    .sort((left, right) => right.bonusPoints - left.bonusPoints || left.minutesLimit - right.minutesLimit)
    .find((bonus) => elapsedMinutes <= bonus.minutesLimit);
}

function resolveGroupBonus({
  awardAtMs,
  awardedGroupBonusIds,
  group,
  missionId,
  releaseInfo,
  successTimesByMissionId,
}: {
  awardAtMs: number;
  awardedGroupBonusIds: string[];
  group: GroupRewardContext | null;
  missionId: string;
  releaseInfo: Map<string, MissionReleaseInfo>;
  successTimesByMissionId: Map<string, number>;
}): GroupBonusDto | undefined {
  if (!group || !group._id || !group.title || !group.completionBonusPoints || group.completionBonusPoints <= 0) {
    return undefined;
  }

  if (awardedGroupBonusIds.includes(group._id)) {
    return undefined;
  }

  const groupMissionIds = Array.isArray(group.missions) ? group.missions.map((item) => item._id) : [];
  if (!groupMissionIds.includes(missionId) || groupMissionIds.length === 0) {
    return undefined;
  }

  const allReleased = groupMissionIds.every((groupMissionId) => {
    const releasedAtMs = toMillis(releaseInfo.get(groupMissionId)?.effectiveReleaseAt);
    return releasedAtMs !== null && releasedAtMs <= awardAtMs;
  });
  if (!allReleased) {
    return undefined;
  }

  const allCompleted = groupMissionIds.every((groupMissionId) => successTimesByMissionId.has(groupMissionId) || groupMissionId === missionId);
  if (!allCompleted) {
    return undefined;
  }

  return {
    bonusPoints: Math.round(group.completionBonusPoints),
    groupId: group._id,
    groupTitle: group.title,
  };
}

async function computeLatestBreakAtMs({
  awardAtMs,
  mode,
  rejectedAtMs,
  successTimesByMissionId,
}: {
  awardAtMs: number;
  mode: NarrativeMode;
  rejectedAtMs: number[];
  successTimesByMissionId: Map<string, number>;
}): Promise<number> {
  const missionReleases = await loadAllExpiringMissionReleases(mode);
  const breakCandidates = [...rejectedAtMs];
  return breakCandidates.reduce((latest, current) => (current <= awardAtMs && current > latest ? current : latest), computeLatestExpiryBreakAtMs({
    awardAtMs,
    missionReleases,
    successTimesByMissionId,
  }));
}

function computeLatestExpiryBreakAtMs({
  awardAtMs,
  missionReleases,
  successTimesByMissionId,
}: {
  awardAtMs: number;
  missionReleases: MissionReleaseInfo[];
  successTimesByMissionId: Map<string, number>;
}): number {
  return missionReleases.reduce((latestBreakAtMs, missionRelease) => {
    const expiresAtMs = toMillis(missionRelease.expiresAt);
    const releaseAtMs = toMillis(missionRelease.effectiveReleaseAt);
    if (expiresAtMs === null || releaseAtMs === null || releaseAtMs > awardAtMs || expiresAtMs > awardAtMs) {
      return latestBreakAtMs;
    }

    const successAtMs = successTimesByMissionId.get(missionRelease._id);
    const completedBeforeExpiry = successAtMs !== undefined && successAtMs <= expiresAtMs;
    if (completedBeforeExpiry) {
      return latestBreakAtMs;
    }

    return expiresAtMs > latestBreakAtMs ? expiresAtMs : latestBreakAtMs;
  }, 0);
}

async function loadAllExpiringMissionReleases(mode: NarrativeMode): Promise<MissionReleaseInfo[]> {
  const query = `*[_type == "mission" && defined(expiresAt) && !(_id in path("drafts.**"))]{
    _id,
    expiresAt,
    "firstBundle": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && references(^._id)]
      | order(coalesce(releaseAt, _updatedAt) asc)[0]{
        "effectiveReleaseAt": coalesce(releaseAt, _updatedAt)
      }
  }`;
  const missions = await sanityQuery<Array<{ _id: string; expiresAt?: string; firstBundle?: { effectiveReleaseAt?: string } }>>(query, {}, mode);

  return missions.map((mission) => ({
    _id: mission._id,
    ...(typeof mission.expiresAt === 'string' ? { expiresAt: mission.expiresAt } : {}),
    ...(typeof mission.firstBundle?.effectiveReleaseAt === 'string'
      ? { effectiveReleaseAt: mission.firstBundle.effectiveReleaseAt }
      : {}),
  }));
}

function normalizeThreshold(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }

  return Math.max(1, Math.round(value));
}

function normalizeMultiplier(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, value);
}

function toMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object') {
    if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      try {
        const result = (value as { toMillis: () => number }).toMillis();
        return Number.isFinite(result) ? result : null;
      } catch {
        return null;
      }
    }

    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number') {
      return (seconds * 1000) + (typeof nanoseconds === 'number' ? Math.floor(nanoseconds / 1_000_000) : 0);
    }
  }

  return null;
}

function asRewardBreakdown(value: unknown): RewardBreakdownDto | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, any>;
  if (typeof raw.basePoints !== 'number' || typeof raw.streakBonusPoints !== 'number' || typeof raw.totalPoints !== 'number') {
    return undefined;
  }

  return {
    basePoints: raw.basePoints,
    ...(Array.isArray(raw.customAchievements) ? { customAchievements: raw.customAchievements } : {}),
    ...(raw.groupBonus && typeof raw.groupBonus === 'object' ? { groupBonus: raw.groupBonus } : {}),
    streakBonusPoints: raw.streakBonusPoints,
    ...(raw.timeBonus && typeof raw.timeBonus === 'object' ? { timeBonus: raw.timeBonus } : {}),
    totalPoints: raw.totalPoints,
  };
}

function asStreakSummary(value: unknown): StreakSummaryDto | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, any>;
  if (typeof raw.count !== 'number' || typeof raw.isActive !== 'boolean' || typeof raw.multiplier !== 'number') {
    return undefined;
  }

  return {
    count: raw.count,
    isActive: raw.isActive,
    multiplier: raw.multiplier,
  };
}
