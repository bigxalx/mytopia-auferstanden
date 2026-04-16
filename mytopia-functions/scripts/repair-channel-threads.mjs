#!/usr/bin/env node
/**
 * Repairs channel thread summaries and removes legacy transient system messages.
 *
 * Usage:
 *   bun ./scripts/repair-channel-threads.mjs --email armin@example.com --mode dev
 *   bun ./scripts/repair-channel-threads.mjs --uid <uid> --mode dev --channel <channelId> --apply
 *
 * Notes:
 * - Dry-run by default. Pass --apply to write changes.
 * - Deletes only legacy transient status bubbles, currently identified as:
 *   - attachment._type === "systemAttachment"
 *   - text in {"Mission unterbrochen.","Mission fortgesetzt","Mission gestartet"}
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'mytopia-6c440';
const CHANNEL_THREADS_PATH = 'v2/app/channelThreads';
const CHANNEL_MESSAGES_SUBCOLLECTION = 'messages';
const LEGACY_TRANSIENT_TEXTS = new Set([
  'Mission unterbrochen.',
  'Mission fortgesetzt',
  'Mission gestartet',
]);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const mode = readFlagValue('--mode') ?? 'production';
const channelId = readFlagValue('--channel') ?? null;
const email = readFlagValue('--email') ?? null;
const uidArg = readFlagValue('--uid') ?? null;

if ((!uidArg && !email) || !['production', 'dev'].includes(mode)) {
  printUsageAndExit();
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const auth = getAuth();
const firestore = getFirestore();
const uid = uidArg ?? (await auth.getUserByEmail(email)).uid;

const threadRefs = channelId
  ? [firestore.collection(CHANNEL_THREADS_PATH).doc(buildChannelThreadDocId({ channelId, mode, uid }))]
  : (await firestore.collection(CHANNEL_THREADS_PATH)
      .where('ownerUid', '==', uid)
      .where('mode', '==', mode)
      .get()).docs.map((doc) => doc.ref);

if (threadRefs.length === 0) {
  console.log(`No channel threads found for uid=${uid} mode=${mode}.`);
  process.exit(0);
}

let repairedCount = 0;
let deletedMessageCount = 0;

for (const threadRef of threadRefs) {
  const threadSnapshot = await threadRef.get();
  if (!threadSnapshot.exists) {
    console.log(`Skipping missing thread ${threadRef.id}`);
    continue;
  }

  const messageSnapshots = await threadRef
    .collection(CHANNEL_MESSAGES_SUBCOLLECTION)
    .orderBy('createdAtMs', 'asc')
    .get();

  const messageDocs = messageSnapshots.docs.map((doc) => ({
    createdAtMs: typeof doc.get('createdAtMs') === 'number' ? doc.get('createdAtMs') : 0,
    data: doc.data(),
    id: doc.id,
    ref: doc.ref,
  }));
  const transientDocs = messageDocs.filter((doc) => isTransientLegacyMessage(doc.data));
  const keptDocs = messageDocs.filter((doc) => !isTransientLegacyMessage(doc.data));
  const summaryPatch = buildThreadSummaryPatch({
    keptDocs,
    mode,
    threadData: threadSnapshot.data(),
    uid,
  });

  const needsSummaryWrite = threadSummaryNeedsUpdate(threadSnapshot.data(), summaryPatch);
  if (!transientDocs.length && !needsSummaryWrite) {
    continue;
  }

  repairedCount += 1;
  deletedMessageCount += transientDocs.length;

  console.log(
    `${apply ? 'Repairing' : 'Would repair'} ${threadRef.id}: delete=${transientDocs.length} keep=${keptDocs.length} preview="${summaryPatch.lastPreview}"`
  );

  if (!apply) {
    continue;
  }

  for (const refsChunk of chunk(transientDocs.map((doc) => doc.ref), 400)) {
    const batch = firestore.batch();
    refsChunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await threadRef.set(summaryPatch, { merge: true });
}

console.log(
  `${apply ? 'Applied' : 'Planned'} repairs for ${repairedCount} thread(s); transient messages ${apply ? 'deleted' : 'matched'}: ${deletedMessageCount}.`
);

function buildChannelThreadDocId({
  channelId,
  mode,
  uid,
}) {
  return `${mode}__${uid}__${channelId}`;
}

function readFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

function printUsageAndExit() {
  console.error('Usage:');
  console.error('  bun ./scripts/repair-channel-threads.mjs --uid <uid> --mode <production|dev> [--channel <channelId>] [--apply]');
  console.error('  bun ./scripts/repair-channel-threads.mjs --email <email> --mode <production|dev> [--channel <channelId>] [--apply]');
  process.exit(1);
}

function isTransientLegacyMessage(data) {
  const message = data?.message;
  const attachment = message?.attachment;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  return attachment?._type === 'systemAttachment' || LEGACY_TRANSIENT_TEXTS.has(text);
}

function buildThreadSummaryPatch({
  keptDocs,
  mode,
  threadData,
  uid,
}) {
  const latest = keptDocs[keptDocs.length - 1] ?? null;
  const earliest = keptDocs[0] ?? null;
  const nowMs = Date.now();
  const lastReadAtMs = typeof threadData?.lastReadAtMs === 'number'
    ? threadData.lastReadAtMs
    : (latest?.createdAtMs ?? nowMs);
  const openedAtMs = typeof threadData?.openedAtMs === 'number'
    ? threadData.openedAtMs
    : (earliest?.createdAtMs ?? latest?.createdAtMs ?? nowMs);

  return {
    ...(typeof threadData?.actorId === 'string' ? { actorId: threadData.actorId } : {}),
    ...(typeof threadData?.avatarUrl === 'string' ? { avatarUrl: threadData.avatarUrl } : {}),
    channelId: typeof threadData?.channelId === 'string' ? threadData.channelId : threadData?.actorId ?? 'unknown',
    channelType: threadData?.channelType === 'hub' ? 'hub' : 'actor',
    lastMessageAtMs: latest?.createdAtMs ?? openedAtMs,
    lastPreview: latest ? buildPreview(latest.data.message) : 'Kanal erstellt',
    lastReadAtMs,
    messageCount: keptDocs.length,
    mode,
    openedAtMs,
    ownerUid: typeof threadData?.ownerUid === 'string' ? threadData.ownerUid : uid,
    ...(typeof threadData?.role === 'string' ? { role: threadData.role } : {}),
    title: typeof threadData?.title === 'string'
      ? threadData.title
      : (threadData?.channelType === 'hub' ? 'Notfallkanal' : 'Kanal'),
    unreadCount: keptDocs.reduce(
      (count, doc) => count + (doc.createdAtMs > lastReadAtMs ? 1 : 0),
      0
    ),
  };
}

function buildPreview(message) {
  if (typeof message?.text === 'string' && message.text.trim().length > 0) {
    return message.text.trim();
  }

  switch (message?.attachment?._type) {
    case 'missionAttachment':
      return message.attachment.missionTitle ?? 'Mission';
    case 'submissionAttachment':
      return 'Antwort gesendet';
    case 'missionResultAttachment':
      return 'Mission abgeschlossen';
    case 'imageAttachment':
      return 'Bild';
    case 'audioAttachment':
      return 'Audio';
    case 'videoAttachment':
      return 'Video';
    case 'systemAttachment':
      return 'Status';
    default:
      return 'Neue Nachricht';
  }
}

function threadSummaryNeedsUpdate(current, next) {
  return [
    'actorId',
    'avatarUrl',
    'channelId',
    'channelType',
    'lastMessageAtMs',
    'lastPreview',
    'lastReadAtMs',
    'messageCount',
    'mode',
    'openedAtMs',
    'ownerUid',
    'role',
    'title',
    'unreadCount',
  ].some((key) => normalizeComparable(current?.[key]) !== normalizeComparable(next?.[key]));
}

function normalizeComparable(value) {
  return value ?? '__missing__';
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
