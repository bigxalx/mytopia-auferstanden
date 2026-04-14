export const V2_COLLECTION = {
  channelThreads: 'v2/app/channelThreads',
  leaderboard: 'v2/app/leaderboard',
  narrativeState: 'v2/app/narrativeState',
  narrativeStateDev: 'v2/app/narrativeStateDev',
  scoreEvents: 'v2/app/scoreEvents',
  submissions: 'v2/app/submissions',
  tasks: 'v2/app/tasks',
  users: 'v2/app/users',
  fcmRegistrations: 'v2/app/fcmRegistrations',
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

export type V2UserDoc = {
  createdAt: FirestoreTimestampString;
  displayName: string;
  email: string;
  legacySummary?: LegacySummary;
  photoURL?: string;
  pointsCurrent?: number;
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
  createdAt: FirestoreTimestampString;
  earnedPoints?: number;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
  moderatorNote?: string;
  ownerUid: string;
  payload: string;
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
  metadata?: Record<string, string | number | boolean | null>;
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
