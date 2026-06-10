export type TimeBonusDto = {
      bonusPoints: number;
      minutesLimit: number;
};

export type CustomAchievementDto = {
      bonusPoints: number;
      description?: string;
      id: string;
      title: string;
};

export type GroupBonusDto = {
      bonusPoints: number;
      groupId: string;
      groupTitle: string;
};

export type RewardBreakdownDto = {
      basePoints: number;
      customAchievements?: CustomAchievementDto[];
      groupBonus?: GroupBonusDto;
      streakBonusPoints: number;
      timeBonus?: TimeBonusDto;
      totalPoints: number;
};

export type StreakSummaryDto = {
      count: number;
      isActive: boolean;
      multiplier: number;
};

export type MissionResultPayloadDto = {
      action?: 'approved' | 'rejected' | 'scored' | 'already_completed';
      correct?: number;
      moderatorNote?: string;
      rewardBreakdown?: RewardBreakdownDto;
      status?: 'approved' | 'rejected';
      streakSummary?: StreakSummaryDto;
      total?: number;
};

export type NarrativeReactionId =
      | 'thumbsUp'
      | 'thumbsDown'
      | 'heart'
      | 'shocked'
      | 'laughing';

export type AttachmentDto = | {
        _type: 'systemAttachment';
        kind: 'neutral' | 'prominent';
      }
      | {
        _type: 'imageAttachment';
        caption?: string;
        url: string;
      }
      | {
        _type: 'audioAttachment' | 'videoAttachment';
        extension?: string;
        mimeType?: string;
        originalFilename?: string;
        title?: string;
        url: string;
      }
      | {
        _type: 'missionAttachment';
        excerpt?: string;
        imageUrl?: string;
        missionId: string;
        missionKind?: string;
        missionPoints?: number;
        missionTitle?: string;
        title?: string;
      }
      | {
        _type: 'submissionAttachment';
        submissionId: string;
        status: 'pending' | 'approved' | 'rejected';
        kind: 'gps' | 'quiz' | 'text' | 'photo';
        payload: any;
        missionTitle: string;
        missionId?: string;
        moderatorNote?: string;
      }
      | {
        _type: 'missionResultAttachment';
        missionId: string;
        missionTitle: string;
        kind: string;
        payload: MissionResultPayloadDto;
        earnedPoints?: number;
      };
export type MessageDto = {
      actor: {
        actorId?: string;
        avatarUrl?: string;
        name: string;
        nameColor?: string;
        role?: string;
      };
      attachment?: AttachmentDto;
      messageId: string;
      text?: string;
    };
export type BundleDto = {
      _id: string;
      messages: MessageDto[];
      script?: string;
      scriptActor?: {
        _id?: string;
        avatarUrl?: string;
        name: string;
        nameColor?: string;
        role?: string;
      };
      pushBody?: string;
      pushTitle?: string;
      pushNow?: boolean;
      publishMode?: 'scheduled' | 'instant';
      releaseAt: string;
    };
export type NarrativeActorProfileDto = {
      _id: string;
      avatarUrl?: string;
      bio?: string;
      name: string;
      nameColor?: string;
      role?: string;
};
export type FeedCursor = {
      id: string;
      releaseAt: string;
    };
export type NarrativeMode = 'production' | 'dev';
export type NarrativeStateEventType = 'content_update' | 'release';
export type SanityWebhookPayload = {
      _id?: unknown;
      _type?: unknown;
      documentId?: unknown;
      operation?: unknown;
      ids?: {
        created?: unknown;
        updated?: unknown;
        deleted?: unknown;
      };
    };
export type EnvConfig = {
      cloudTasksLocation: string;
      cloudTasksQueue: string;
      adaptorLiveTriggerToken?: string;
      fcmTopicNarrative: string;
      fcmTopicNarrativeDev?: string;
      projectId: string;
      releaseFunctionUrl: string;
      sanityApiToken: string;
      sanityDataset: string;
      sanityDatasetDev?: string;
      sanityProjectId: string;
      sanityWebhookSecret: string;
      tasksServiceAccountEmail: string;
    };
export type FirebaseResponse = {
      status: (statusCode: number) => {
        json: (payload: unknown) => unknown;
      };
    };
export type MissionDto = {
      _id: string;
      expiresAt?: string;
      groupCompletionBonusPoints?: number;
      groupId?: string;
      groupTitle?: string;
      kind: 'gps' | 'quiz' | 'text' | 'photo';
      points: number;
      questions?: Array<{
        options: Array<{ isCorrect: boolean; text: string }>;
        questionText: string;
        feedbackCorrect?: string;
        feedbackIncorrect?: string;
      }>;
      timeBonuses?: TimeBonusDto[];
      title: string;
      feedbackCorrect?: string;
      feedbackIncorrect?: string;
};

export type MissionSettingsDto = {
      customAchievementCount?: number;
      customAchievements?: CustomAchievementDto[];
      defaultQuizFeedbackCorrect?: string;
      defaultQuizFeedbackIncorrect?: string;
      streakMultiplier?: number;
      streakRequiredCompletions?: number;
};

type BaseMapPointDto = {
    description?: string;
    id: string;
    imageUrl?: string;
    latitude: number;
    longitude: number;
    title: string;
};

export type MissionMapPointDto = BaseMapPointDto & {
    points: number;
    radiusMeters: number;
    type: 'mission';
};

export type CheckpointMapPointDto = BaseMapPointDto & {
    type: 'checkpoint';
};

export type MapPointDto = MissionMapPointDto | CheckpointMapPointDto;

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type SubmissionDto = {
    createdAt: any; // Typically serverTimestamp in firestore, but ISO when sent to client
    customAchievementIds?: string[];
    idempotencyKey: string;
    metadata: {
        missionTitle: string;
        channelMeta?: {
            actorAvatarUrl?: string;
            actorId?: string;
            actorName?: string;
            channelId?: string;
            channelType?: 'hub' | 'actor';
        };
    };
    mode: 'production' | 'dev';
    ownerUid: string;
    payload: any;
    sourceId: string;
    sourceType: 'gps' | 'quiz' | 'text' | 'photo';
    status: SubmissionStatus;
    moderatorNote?: string;
    awarded?: boolean;
    awardedAt?: any;
};
