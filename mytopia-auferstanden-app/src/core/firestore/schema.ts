export const V2_COLLECTION = {
  leaderboard: 'v2/app/leaderboard',
  narrativeState: 'v2/app/narrativeState',
  scoreEvents: 'v2/app/scoreEvents',
  submissions: 'v2/app/submissions',
  tasks: 'v2/app/tasks',
  users: 'v2/app/users',
} as const;

export type FirestoreTimestampString = string;

export type SubmissionType = 'text' | 'photo';
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type ScoreEventReason =
  | 'task_approved'
  | 'moderation_penalty'
  | 'legacy_import'
  | 'manual_adjustment';

export type ScoreEventSourceType = 'submission' | 'import' | 'admin';

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
  createdAt: FirestoreTimestampString;
  moderatorNote?: string;
  ownerUid: string;
  photoPath?: string;
  reviewedAt?: FirestoreTimestampString;
  reviewedBy?: string;
  status: SubmissionStatus;
  submittedAt?: FirestoreTimestampString;
  taskId: string;
  text?: string;
  type: SubmissionType;
  updatedAt: FirestoreTimestampString;
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
  rank?: number;
  totalPoints: number;
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
