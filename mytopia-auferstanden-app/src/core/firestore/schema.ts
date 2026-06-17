export const V2_COLLECTION = {
  channelThreads: 'v2/app/channelThreads',
  leaderboard: 'v2/app/leaderboard',
  narrativeState: 'v2/app/narrativeState',
  narrativeStateDev: 'v2/app/narrativeStateDev',
  narrativeReactions: 'v2/app/narrativeReactions',
  narrativeUserReactions: 'v2/app/narrativeUserReactions',
  scoreEvents: 'v2/app/scoreEvents',
  submissions: 'v2/app/submissions',
  tasks: 'v2/app/tasks',
  users: 'v2/app/users',
  fcmRegistrations: 'v2/app/fcmRegistrations',
  liveSessions: 'v2/app/liveSessions',
} as const;

export type FirestoreTimestampString = string;
export type ChannelMode = 'production' | 'dev';
export type ChannelType = 'hub' | 'actor';
export type ChannelMessageDoc = {
  bundleId: string;
  channelId: string;
  createdAtMs: number;
  isUser: boolean;
  message: unknown;
  mode: ChannelMode;
  ownerUid: string;
  title: string;
};
export type V2ChannelThreadDoc = {
  actorId?: string;
  avatarUrl?: string;
  channelId: string;
  channelType: ChannelType;
  lastMessageAtMs: number;
  lastPreview: string;
  lastReadAtMs: number;
  messageCount: number;
  mode: ChannelMode;
  openedAtMs: number;
  ownerUid: string;
  role?: string;
  title: string;
  unreadCount: number;
};

export type SubmissionType = 'text' | 'photo';
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type ScoreEventReason =
  | 'quiz_completed'
  | 'gps_completed'
  | 'text_approved'
  | 'photo_approved'
  | 'moderation_penalty'
  | 'legacy_import'
  | 'manual_adjustment';

export type ScoreEventSourceType = 'submission' | 'quiz' | 'gps' | 'text' | 'photo' | 'import' | 'admin';

export type LegacySummary = {
  citizenship?: Record<string, unknown>;
  importedAt: FirestoreTimestampString;
  properties?: unknown[];
  rankSnapshot: number;
  totalPoints: number;
};

export type TimeBonusSummary = {
  bonusPoints: number;
  minutesLimit: number;
};

export type CustomAchievementSummary = {
  bonusPoints: number;
  description?: string;
  id: string;
  title: string;
};

export type GroupBonusSummary = {
  bonusPoints: number;
  groupId: string;
  groupTitle: string;
};

export type RewardBreakdown = {
  basePoints: number;
  customAchievements?: CustomAchievementSummary[];
  groupBonus?: GroupBonusSummary;
  streakBonusPoints: number;
  timeBonus?: TimeBonusSummary;
  totalPoints: number;
};

export type StreakSummary = {
  count: number;
  isActive: boolean;
  multiplier: number;
};

export type V2UserDoc = {
  awardedGroupBonusIds?: string[];
  createdAt: FirestoreTimestampString;
  displayName: string;
  email: string;
  legacySummary?: LegacySummary;
  photoURL?: string;
  pointsCurrent?: number;
  streakCount?: number;
  streakLastUpdatedAt?: FirestoreTimestampString;
  streakMultiplierCurrent?: number;
  uid: string;
  updatedAt: FirestoreTimestampString;
};

export type V2TaskDoc = {
  active: boolean;
  createdAt: FirestoreTimestampString;
  description: string;
  maxPoints: number;
  title: string;
  type: SubmissionType | 'quiz' | 'gps';
  updatedAt: FirestoreTimestampString;
};

export type V2SubmissionDoc = {
  awarded?: boolean;
  awardedAt?: FirestoreTimestampString;
  awardedPoints?: number;
  createdAt: FirestoreTimestampString;
  customAchievementIds?: string[];
  earnedPoints?: number;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
  moderatorNote?: string;
  ownerUid: string;
  payload: string;
  rewardBreakdown?: RewardBreakdown;
  reviewedAt?: FirestoreTimestampString;
  reviewedBy?: string;
  sourceId: string;
  sourceType: SubmissionType;
  status: SubmissionStatus;
};

export type SubmissionChannelMeta = {
  actorAvatarUrl?: string;
  actorId?: string;
  actorName?: string;
  channelId?: string;
  channelType?: ChannelType;
};

export type V2ScoreEventDoc = {
  createdAt: FirestoreTimestampString;
  createdBy: string;
  delta: number;
  idempotencyKey: string;
  metadata?: {
    correct?: number;
    missionTitle?: string;
    rewardBreakdown?: RewardBreakdown;
    streakSummary?: StreakSummary;
    total?: number;
  };
  reason: ScoreEventReason;
  sourceId: string;
  sourceType: ScoreEventSourceType;
  uid: string;
};

export type V2LeaderboardDoc = {
  displayName: string;
  pointsCurrent: number;
  rank?: number;
  uid: string;
  updatedAt: FirestoreTimestampString;
};

export type NarrativeStateEventType = 'release' | 'content_update';

export type NarrativePushState = 'pending' | 'sent' | 'failed';

export type V2NarrativeStateDoc = {
  bundleId: string;
  lastEventType: NarrativeStateEventType;
  lastReleaseError?: string;
  pushSentAt?: FirestoreTimestampString;
  pushState?: NarrativePushState;
  releaseAt?: FirestoreTimestampString;
  releasedAt?: FirestoreTimestampString;
  updatedAt: FirestoreTimestampString;
  version: number;
};

export type V2NarrativeReactionDoc = {
  bundleId: string;
  messages: Record<string, { counts: Record<string, number> }>;
  mode: ChannelMode;
  updatedAt: FirestoreTimestampString;
};

export type V2NarrativeUserReactionDoc = {
  bundleId: string;
  messages: Record<string, { reaction: string }>;
  mode: ChannelMode;
  ownerUid: string;
  updatedAt: FirestoreTimestampString;
};

export type LiveSessionStatus = 'draft' | 'active' | 'paused' | 'closed';
export type LiveConnectionState = 'connected' | 'reconnecting' | 'offline';
export type LiveJoinMethod = 'qr' | 'auto-gps-time' | 'auto-time-only' | 'manual-admin';
export type LiveEventType = 'terror_alert';
export type LiveEventStatus = 'active' | 'cleared';
export type LiveEventSource = 'admin' | 'adaptor';
export type LiveSessionSource = 'schedule' | 'manual';
export type LiveShowWindowStatus = 'scheduled' | 'cancelled';

export type V2LiveSessionDoc = {
  currentEventId?: string | null;
  endsAt?: FirestoreTimestampString;
  mode: ChannelMode;
  sessionSource?: LiveSessionSource;
  sessionId: string;
  showWindowId?: string | null;
  startsAt?: FirestoreTimestampString;
  status: LiveSessionStatus;
  title: string;
  updatedAt?: FirestoreTimestampString;
  venueLatitude?: number | null;
  venueLongitude?: number | null;
  venueName?: string | null;
  venueRadiusMeters?: number | null;
};

export type V2LiveParticipantDoc = {
  connectionState: LiveConnectionState;
  deviceLabel?: string;
  joinedAt: FirestoreTimestampString;
  joinMethod: LiveJoinMethod;
  lastSeenAt: FirestoreTimestampString;
  leftAt?: FirestoreTimestampString;
  uid: string;
  updatedAt: FirestoreTimestampString;
};

export type V2LiveShowWindowDoc = {
  cancelledAt?: FirestoreTimestampString;
  cancelledBy?: string | null;
  createdAt?: FirestoreTimestampString;
  createdBy?: string | null;
  endsAt?: FirestoreTimestampString;
  mode: ChannelMode;
  startsAt?: FirestoreTimestampString;
  status: LiveShowWindowStatus;
  title: string;
  updatedAt?: FirestoreTimestampString;
  updatedBy?: string | null;
  venueLatitude?: number | null;
  venueLongitude?: number | null;
  venueName?: string | null;
  venueRadiusMeters?: number | null;
  windowId: string;
};

export type V2LiveEventDoc = {
  clearCueId?: string | null;
  clearedAt?: FirestoreTimestampString;
  clearedBy?: string;
  createdAt: FirestoreTimestampString;
  createdBy: string;
  cueId?: string | null;
  mode: ChannelMode;
  payload?: {
    message?: string;
    severity?: string;
    title?: string;
  };
  source: LiveEventSource;
  status: LiveEventStatus;
  type: LiveEventType;
  updatedAt: FirestoreTimestampString;
};
