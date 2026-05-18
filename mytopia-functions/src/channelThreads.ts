import { FieldValue, type DocumentReference, type WriteBatch } from 'firebase-admin/firestore';

import { firestore } from './firebase.js';
import { V2_CHANNEL_THREADS_COLLECTION_PATH } from './constants.js';
import { AttachmentDto, MessageDto, NarrativeMode } from './types.js';

const CHANNEL_MESSAGES_SUBCOLLECTION = 'messages';
const MAX_BATCH_WRITES = 450;

type ChannelActorMeta = {
  actorAvatarUrl?: string;
  actorId?: string;
  actorName?: string;
  actorNameColor?: string;
  actorRole?: string;
};

type UpsertChannelMessageParams = {
  attachment?: AttachmentDto;
  channelId: string;
  channelType: 'hub' | 'actor';
  createdAtMs: number;
  incrementUnread: boolean;
  isUser?: boolean;
  messageId: string;
  mode: NarrativeMode;
  ownerUid: string;
  text?: string;
  title: string;
} & ChannelActorMeta;

export function buildChannelThreadDocId({
  channelId,
  mode,
  uid,
}: {
  channelId: string;
  mode: NarrativeMode;
  uid: string;
}) {
  return `${mode}__${uid}__${channelId}`;
}

export async function ensureActorChannelThread({
  actorAvatarUrl,
  actorId,
  actorName,
  mode,
  uid,
}: {
  actorAvatarUrl?: string;
  actorId: string;
  actorName: string;
  mode: NarrativeMode;
  uid: string;
}) {
  const threadDocId = buildChannelThreadDocId({ channelId: actorId, mode, uid });
  const nowMs = Date.now();
  const threadRef = firestore.collection(V2_CHANNEL_THREADS_COLLECTION_PATH).doc(threadDocId);
  const existingSnapshot = await threadRef.get();

  if (existingSnapshot.exists) {
    await threadRef.set(
      {
        actorId,
        ...(actorAvatarUrl ? { avatarUrl: actorAvatarUrl } : {}),
        channelId: actorId,
        channelType: 'actor',
        mode,
        ownerUid: uid,
        title: actorName,
      },
      { merge: true }
    );

    return threadDocId;
  }

  await threadRef.set(
    {
      actorId,
      ...(actorAvatarUrl ? { avatarUrl: actorAvatarUrl } : {}),
      channelId: actorId,
      channelType: 'actor',
      lastMessageAtMs: nowMs,
      lastPreview: 'Kanal erstellt',
      lastReadAtMs: nowMs,
      messageCount: 0,
      mode,
      openedAtMs: nowMs,
      ownerUid: uid,
      title: actorName,
      unreadCount: 0,
    },
    { merge: true }
  );

  return threadDocId;
}

export async function syncActorMetadataToChannelThreads({
  actorAvatarUrl,
  actorId,
  actorName,
  actorNameColor,
  actorRole,
  mode,
}: {
  actorAvatarUrl?: string;
  actorId: string;
  actorName: string;
  actorNameColor?: string;
  actorRole?: string;
  mode: NarrativeMode;
}) {
  const threadSnapshots = await firestore.collection(V2_CHANNEL_THREADS_COLLECTION_PATH)
    .where('mode', '==', mode)
    .where('channelType', '==', 'actor')
    .where('actorId', '==', actorId)
    .get();

  const actorPatch = buildStoredActorPatch({
    actorAvatarUrl,
    actorId,
    actorName,
    actorNameColor,
    actorRole,
  });
  const summaryPatch = buildThreadActorSummaryPatch({
    actorAvatarUrl,
    actorId,
    actorName,
    actorRole,
  });

  let batch: WriteBatch = firestore.batch();
  let pendingWrites = 0;
  let messageCount = 0;

  const flush = async () => {
    if (pendingWrites === 0) {
      return;
    }

    await batch.commit();
    batch = firestore.batch();
    pendingWrites = 0;
  };

  const queueUpdate = async (ref: DocumentReference, patch: Record<string, unknown>) => {
    batch.update(ref, patch);
    pendingWrites += 1;

    if (pendingWrites >= MAX_BATCH_WRITES) {
      await flush();
    }
  };

  for (const threadDoc of threadSnapshots.docs) {
    await queueUpdate(threadDoc.ref, summaryPatch);

    const messageSnapshots = await threadDoc.ref
      .collection(CHANNEL_MESSAGES_SUBCOLLECTION)
      .where('message.actor.actorId', '==', actorId)
      .get();

    for (const messageDoc of messageSnapshots.docs) {
      await queueUpdate(messageDoc.ref, actorPatch);
      messageCount += 1;
    }
  }

  await flush();

  return {
    messageCount,
    threadCount: threadSnapshots.size,
  };
}

export async function upsertChannelMessage(params: UpsertChannelMessageParams) {
  const threadDocId = buildChannelThreadDocId({
    channelId: params.channelId,
    mode: params.mode,
    uid: params.ownerUid,
  });

  const actor = buildActor(params);
  const message: MessageDto = {
    actor,
    ...(params.attachment ? { attachment: params.attachment } : {}),
    ...(params.text ? { text: params.text } : {}),
    messageId: params.messageId,
  };

  const summaryPatch = {
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.actorAvatarUrl ? { avatarUrl: params.actorAvatarUrl } : {}),
    channelId: params.channelId,
    channelType: params.channelType,
    lastMessageAtMs: params.createdAtMs,
    lastPreview: buildPreview(message),
    ...(params.incrementUnread ? {} : { lastReadAtMs: params.createdAtMs }),
    messageCount: FieldValue.increment(1),
    mode: params.mode,
    openedAtMs: params.createdAtMs,
    ownerUid: params.ownerUid,
    title: params.title,
    unreadCount: params.incrementUnread ? FieldValue.increment(1) : 0,
  };

  const batch = firestore.batch();
  const threadRef = firestore.collection(V2_CHANNEL_THREADS_COLLECTION_PATH).doc(threadDocId);
  const messageRef = threadRef.collection(CHANNEL_MESSAGES_SUBCOLLECTION).doc(params.messageId);

  batch.set(
    threadRef,
    summaryPatch,
    { merge: true }
  );
  batch.set(messageRef, {
    bundleId: params.messageId,
    channelId: params.channelId,
    createdAtMs: params.createdAtMs,
    isUser: Boolean(params.isUser),
    message,
    mode: params.mode,
    ownerUid: params.ownerUid,
    title: params.title,
  });
  await batch.commit();
}

function buildActor(params: ChannelActorMeta): MessageDto['actor'] {
  return {
    ...(params.actorAvatarUrl ? { avatarUrl: params.actorAvatarUrl } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.actorNameColor ? { nameColor: params.actorNameColor } : {}),
    ...(params.actorRole ? { role: params.actorRole } : {}),
    name: params.actorName ?? 'System',
  };
}

function buildStoredActorPatch({
  actorAvatarUrl,
  actorId,
  actorName,
  actorNameColor,
  actorRole,
}: {
  actorAvatarUrl?: string;
  actorId: string;
  actorName: string;
  actorNameColor?: string;
  actorRole?: string;
}) {
  return {
    'message.actor.actorId': actorId,
    'message.actor.avatarUrl': actorAvatarUrl ?? FieldValue.delete(),
    'message.actor.name': actorName,
    'message.actor.nameColor': actorNameColor ?? FieldValue.delete(),
    'message.actor.role': actorRole ?? FieldValue.delete(),
  };
}

function buildThreadActorSummaryPatch({
  actorAvatarUrl,
  actorId,
  actorName,
  actorRole,
}: {
  actorAvatarUrl?: string;
  actorId: string;
  actorName: string;
  actorRole?: string;
}) {
  return {
    actorId,
    avatarUrl: actorAvatarUrl ?? FieldValue.delete(),
    role: actorRole ?? FieldValue.delete(),
    title: actorName,
  };
}

function buildPreview(message: MessageDto) {
  if (message.text && message.text.trim().length > 0) {
    return message.text.trim();
  }

  switch (message.attachment?._type) {
    case 'systemAttachment':
      return 'Status';
    case 'missionResultAttachment':
      return 'Mission abgeschlossen';
    case 'submissionAttachment':
      return 'Antwort gesendet';
    case 'missionAttachment':
      return message.attachment.missionTitle ?? 'Mission';
    case 'imageAttachment':
      return 'Bild';
    case 'audioAttachment':
      return 'Audio';
    case 'videoAttachment':
      return 'Video';
    default:
      return 'Neue Nachricht';
  }
}
