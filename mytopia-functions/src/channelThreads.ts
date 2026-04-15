import { FieldValue } from 'firebase-admin/firestore';

import { firestore } from './firebase.js';
import { V2_CHANNEL_THREADS_COLLECTION_PATH } from './constants.js';
import { AttachmentDto, MessageDto, NarrativeMode } from './types.js';

const CHANNEL_MESSAGES_SUBCOLLECTION = 'messages';

type ChannelActorMeta = {
  actorAvatarUrl?: string;
  actorId?: string;
  actorName?: string;
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

  await firestore
    .collection(V2_CHANNEL_THREADS_COLLECTION_PATH)
    .doc(threadDocId)
    .set(
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
    unreadCount: FieldValue.increment(params.incrementUnread ? 1 : 0),
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
    name: params.actorName ?? 'System',
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
