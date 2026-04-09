export type AttachmentDto = | {
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
      };
export type MessageDto = {
      actor: {
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
      active: boolean;
      expiresAt?: string;
      kind: 'gps' | 'quiz' | 'text' | 'photo';
      points: number;
      questions?: Array<{
        options: Array<{ isCorrect: boolean; text: string }>;
        questionText: string;
      }>;
      title: string;
    };
