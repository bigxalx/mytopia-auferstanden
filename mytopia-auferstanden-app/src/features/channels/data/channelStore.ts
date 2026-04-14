import { V2_COLLECTION, type ChannelType } from '@/src/core/firestore/schema';
import type { AppMode } from '@/src/core/session/appMode';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

import type { NarrativeAttachmentDto, NarrativeBundleDto, NarrativeMessageDto } from '@/src/features/feed/data/narrativeFeedClient';

export const HUB_CHANNEL_ID = 'hub';
const CHANNEL_MESSAGES_SUBCOLLECTION = 'messages';

export type ChannelId = string;

export type ChannelSummary = {
  actorId?: string;
  avatarUrl?: string;
  channelId: ChannelId;
  channelType: ChannelType;
  lastMessageAtMs: number;
  lastPreview: string;
  lastReadAtMs: number;
  messageCount: number;
  openedAtMs: number;
  title: string;
  unreadCount: number;
};

export type ChannelBundleDoc = {
  bundleId: string;
  channelId: string;
  createdAtMs: number;
  isUser: boolean;
  message: NarrativeMessageDto;
  title: string;
};

export type ActorChannelSeed = {
  actorAvatarUrl?: string;
  actorId: string;
  actorName: string;
};

export function buildChannelThreadDocId({
  channelId,
  mode,
  uid,
}: {
  channelId: string;
  mode: AppMode;
  uid: string;
}) {
  return `${mode}__${uid}__${channelId}`;
}

export function subscribeToChannelSummaries({
  listener,
  mode,
  uid,
}: {
  listener: (summaries: ChannelSummary[]) => void;
  mode: AppMode;
  uid?: string;
}) {
  if (!uid) {
    listener([]);
    return () => undefined;
  }

  const db = getFirestore();
  const summariesQuery = query(
    collection(db, V2_COLLECTION.channelThreads),
    where('ownerUid', '==', uid),
    where('mode', '==', mode),
    orderBy('lastMessageAtMs', 'desc')
  );

  return onSnapshot(
    summariesQuery,
    (snapshot) => {
      listener(
        snapshot.docs
          .map((docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => normalizeChannelSummary(docSnapshot))
          .filter((summary: ChannelSummary | null): summary is ChannelSummary => summary !== null)
      );
    },
    (error) => {
      console.warn('[channels] Failed to subscribe to channel summaries.', error);
      listener([]);
    }
  );
}

export function subscribeToChannelBundles({
  channelId,
  listener,
  mode,
  uid,
}: {
  channelId: string;
  listener: (bundles: NarrativeBundleDto[]) => void;
  mode: AppMode;
  uid?: string;
}) {
  if (!uid) {
    listener([]);
    return () => undefined;
  }

  const db = getFirestore();
  const threadDocId = buildChannelThreadDocId({ channelId, mode, uid });
  const bundlesQuery = query(
    collection(db, V2_COLLECTION.channelThreads, threadDocId, CHANNEL_MESSAGES_SUBCOLLECTION),
    orderBy('createdAtMs', 'asc')
  );

  return onSnapshot(
    bundlesQuery,
    (snapshot) => {
      const bundles = snapshot.docs
        .map((docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot) => normalizeChannelBundle(docSnapshot))
        .filter((bundle: NarrativeBundleDto | null): bundle is NarrativeBundleDto => bundle !== null);
      listener(bundles);
    },
    (error) => {
      console.warn('[channels] Failed to subscribe to channel messages.', error);
      listener([]);
    }
  );
}

export async function ensureActorChannel({
  actorAvatarUrl,
  actorId,
  actorName,
  mode,
  uid,
}: ActorChannelSeed & {
  mode: AppMode;
  uid: string;
}) {
  const db = getFirestore();
  const nowMs = Date.now();
  const threadDocId = buildChannelThreadDocId({ channelId: actorId, mode, uid });
  const threadRef = doc(db, V2_COLLECTION.channelThreads, threadDocId);

  await setDoc(
    threadRef,
    {
      ...(actorAvatarUrl ? { avatarUrl: actorAvatarUrl } : {}),
      actorId,
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

export async function markChannelAsRead({
  channelId,
  mode,
  uid,
}: {
  channelId: string;
  mode: AppMode;
  uid: string;
}) {
  const db = getFirestore();
  const threadDocId = buildChannelThreadDocId({ channelId, mode, uid });
  const threadRef = doc(db, V2_COLLECTION.channelThreads, threadDocId);
  const snapshot = await getDoc(threadRef);
  if (!snapshot.exists()) {
    return;
  }

  const data = snapshot.data() as Record<string, unknown>;
  const lastMessageAtMs =
    typeof data.lastMessageAtMs === 'number' && Number.isFinite(data.lastMessageAtMs)
      ? data.lastMessageAtMs
      : Date.now();

  await updateDoc(threadRef, {
    lastReadAtMs: lastMessageAtMs,
    unreadCount: 0,
  });
}

export async function upsertChannelBundle({
  bundle,
  channelActor,
  channelId,
  channelType,
  incrementUnread = false,
  mode,
  uid,
}: {
  bundle: NarrativeBundleDto;
  channelActor?: ActorChannelSeed;
  channelId: string;
  channelType: ChannelType;
  incrementUnread?: boolean;
  mode: AppMode;
  uid: string;
}) {
  const db = getFirestore();
  const threadDocId = buildChannelThreadDocId({ channelId, mode, uid });
  const threadRef = doc(db, V2_COLLECTION.channelThreads, threadDocId);
  const messageRef = doc(db, V2_COLLECTION.channelThreads, threadDocId, CHANNEL_MESSAGES_SUBCOLLECTION, bundle._id);
  const threadSnapshot = await getDoc(threadRef);
  const messageSnapshot = await getDoc(messageRef);
  const createdAtMs = normalizeCreatedAtMs(bundle.releaseAt);
  const firstMessage = bundle.messages[0];
  if (!firstMessage) {
    return;
  }

  const currentThreadData = threadSnapshot.exists() ? (threadSnapshot.data() as Record<string, unknown>) : {};
  const nextMessageCount = messageSnapshot.exists()
    ? getNumericField(currentThreadData, 'messageCount')
    : getNumericField(currentThreadData, 'messageCount') + 1;
  const nextUnreadCount = incrementUnread
    ? getNumericField(currentThreadData, 'unreadCount') + (messageSnapshot.exists() ? 0 : 1)
    : 0;

  const batch = writeBatch(db);
  batch.set(
    messageRef,
    {
      bundleId: bundle._id,
      channelId,
      createdAtMs,
      isUser: Boolean(bundle.isUser),
      message: firstMessage,
      title: bundle.title,
    }
  );
  batch.set(
    threadRef,
    {
      ...(channelActor?.actorAvatarUrl ? { avatarUrl: channelActor.actorAvatarUrl } : {}),
      ...(channelActor?.actorId ? { actorId: channelActor.actorId } : {}),
      channelId,
      channelType,
      lastMessageAtMs: createdAtMs,
      lastPreview: buildBundlePreview(bundle),
      ...(incrementUnread ? {} : { lastReadAtMs: createdAtMs }),
      messageCount: nextMessageCount,
      mode,
      openedAtMs: getNumericField(currentThreadData, 'openedAtMs') || createdAtMs,
      ownerUid: uid,
      title: channelType === 'hub' ? 'Notfallkanal' : (channelActor?.actorName ?? firstMessage.actor.name),
      unreadCount: nextUnreadCount,
    },
    { merge: true }
  );
  await batch.commit();
}

function normalizeChannelSummary(
  docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot
): ChannelSummary | null {
  const data = docSnapshot.data();
  if (typeof data.channelId !== 'string' || typeof data.title !== 'string') {
    return null;
  }

  const channelType = data.channelType === 'actor' ? 'actor' : 'hub';
  return {
    ...(typeof data.actorId === 'string' ? { actorId: data.actorId } : {}),
    ...(typeof data.avatarUrl === 'string' ? { avatarUrl: data.avatarUrl } : {}),
    channelId: data.channelId,
    channelType,
    lastMessageAtMs: getNumericField(data, 'lastMessageAtMs'),
    lastPreview: typeof data.lastPreview === 'string' ? data.lastPreview : '',
    lastReadAtMs: getNumericField(data, 'lastReadAtMs'),
    messageCount: getNumericField(data, 'messageCount'),
    openedAtMs: getNumericField(data, 'openedAtMs'),
    title: data.title,
    unreadCount: getNumericField(data, 'unreadCount'),
  };
}

function normalizeChannelBundle(
  docSnapshot: FirebaseFirestoreTypes.QueryDocumentSnapshot
): NarrativeBundleDto | null {
  const data = docSnapshot.data() as Partial<ChannelBundleDoc> & Record<string, unknown>;
  const message = data.message as NarrativeMessageDto | undefined;
  if (!message || typeof data.bundleId !== 'string' || typeof data.title !== 'string') {
    return null;
  }

  const createdAtMs = typeof data.createdAtMs === 'number' ? data.createdAtMs : Date.now();
  return {
    _id: data.bundleId,
    isUser: Boolean(data.isUser),
    messages: [message],
    releaseAt: new Date(createdAtMs).toISOString(),
    title: data.title,
  };
}

function buildBundlePreview(bundle: NarrativeBundleDto) {
  const message = bundle.messages[0];
  if (!message) {
    return 'Neue Nachricht';
  }

  if (message.text && message.text.trim().length > 0) {
    return message.text.trim();
  }

  return buildAttachmentPreview(message.attachment);
}

function buildAttachmentPreview(attachment?: NarrativeAttachmentDto) {
  switch (attachment?._type) {
    case 'missionAttachment':
      return attachment.missionTitle ?? 'Mission';
    case 'submissionAttachment':
      return 'Antwort gesendet';
    case 'missionResultAttachment':
      return 'Mission abgeschlossen';
    case 'systemAttachment':
      return 'Status';
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

function normalizeCreatedAtMs(releaseAt: string) {
  const parsed = Date.parse(releaseAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getNumericField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
