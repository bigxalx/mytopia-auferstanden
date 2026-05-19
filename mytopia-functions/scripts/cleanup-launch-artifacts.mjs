#!/usr/bin/env node
/**
 * Production launch cleanup for test artifacts left after Sanity content pruning.
 *
 * Dry-run by default. Pass --apply to delete production app state for detected
 * affected users while keeping their Firebase Auth accounts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = process.env.MYTOPIA_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const SANITY_API_VERSION = 'v2025-02-19';
const PRODUCTION_MODE = 'production';

const CHANNEL_THREADS_PATH = 'v2/app/channelThreads';
const CHANNEL_MESSAGES_SUBCOLLECTION = 'messages';
const LEADERBOARD_PATH = 'v2/app/leaderboard';
const SCORE_EVENTS_PATH = 'v2/app/scoreEvents';
const SUBMISSIONS_PATH = 'v2/app/submissions';
const USERS_PATH = 'v2/app/users';

const BATCH_LIMIT = 400;
const BACKUP_SCHEMA_VERSION = 1;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const FUNCTIONS_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const REPO_ROOT = path.dirname(FUNCTIONS_ROOT);
const DEFAULT_BACKUP_ROOT = path.join(REPO_ROOT, 'tmp', 'cleanup-launch-artifacts');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const restoreTarget = readFlagValue('--restore');
const backupDirArg = readFlagValue('--backup-dir');
const targetEmailArg = readFlagValue('--email');
const targetUidArg = readFlagValue('--uid');

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

if (apply && restoreTarget) {
  console.error('Choose either --apply or --restore, not both.');
  process.exit(1);
}

if (targetEmailArg && targetUidArg) {
  console.error('Choose either --email or --uid, not both.');
  process.exit(1);
}

if (restoreTarget && (targetEmailArg || targetUidArg)) {
  console.error('--email and --uid are cleanup filters and cannot be combined with --restore.');
  process.exit(1);
}

if (!PROJECT_ID) {
  console.error('Set MYTOPIA_FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GCP_PROJECT before running cleanup.');
  process.exit(1);
}

if (!restoreTarget && (!process.env.SANITY_PROJECT_ID || !process.env.SANITY_DATASET || !process.env.SANITY_API_TOKEN)) {
  console.error('Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_API_TOKEN before running cleanup.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const auth = getAuth();
const firestore = getFirestore();
const storage = getStorage();

if (restoreTarget) {
  await restoreBackup(restoreTarget);
  process.exit(0);
}

const targetUser = await resolveTargetUserFilter();
const sanity = await loadProductionSanityIds();
const affectedUsers = filterAffectedUsers(await detectAffectedUsers(sanity), targetUser);
const cleanupPlans = [];

for (const uid of [...affectedUsers.keys()].sort()) {
  cleanupPlans.push(await buildCleanupPlan(uid, affectedUsers.get(uid)));
}

printReport(cleanupPlans, sanity, targetUser);

if (!apply) {
  console.log('\nDry-run only. Re-run with --apply to perform this cleanup.');
  process.exit(0);
}

let backup = null;
try {
  backup = await writeBackup(cleanupPlans, sanity, targetUser);
  console.log(`\nBackup written: ${backup.manifestPath}`);
  console.log(`Restore command: bun run cleanup-launch-artifacts -- --restore ${backup.manifestPath}`);

  for (const plan of cleanupPlans) {
    await applyCleanupPlan(plan);
  }
} catch (error) {
  console.error('\nCleanup failed.');
  if (backup?.manifestPath) {
    console.error(`Backup is available at: ${backup.manifestPath}`);
    console.error(`Restore with: bun run cleanup-launch-artifacts -- --restore ${backup.manifestPath}`);
  }
  throw error;
}

console.log(`\nApplied production launch cleanup for ${cleanupPlans.length} affected user(s).`);

async function loadProductionSanityIds() {
  const query = '*[_type in ["narrativeActor", "mission"] && !(_id in path("drafts.**"))]{_id,_type}';
  const url = new URL(
    `https://${process.env.SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${process.env.SANITY_DATASET}`
  );
  url.searchParams.set('query', query);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.SANITY_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Sanity query failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const actorIds = new Set();
  const missionIds = new Set();

  for (const document of Array.isArray(payload.result) ? payload.result : []) {
    if (typeof document?._id !== 'string') {
      continue;
    }

    if (document._type === 'narrativeActor') {
      actorIds.add(document._id);
    } else if (document._type === 'mission') {
      missionIds.add(document._id);
    }
  }

  return { actorIds, missionIds };
}

async function resolveTargetUserFilter() {
  if (targetEmailArg) {
    const userRecord = await auth.getUserByEmail(targetEmailArg);
    return {
      email: userRecord.email ?? targetEmailArg,
      uid: userRecord.uid,
    };
  }

  if (targetUidArg) {
    const userRecord = await getUserRecord(targetUidArg);
    return {
      email: userRecord?.email ?? null,
      uid: targetUidArg,
    };
  }

  return null;
}

function filterAffectedUsers(affectedUsers, targetUser) {
  if (!targetUser) {
    return affectedUsers;
  }

  const reasons = affectedUsers.get(targetUser.uid);
  return reasons ? new Map([[targetUser.uid, reasons]]) : new Map();
}

async function detectAffectedUsers({ actorIds, missionIds }) {
  const affected = new Map();

  const threadSnapshot = await firestore.collection(CHANNEL_THREADS_PATH).get();

  for (const threadDoc of threadSnapshot.docs) {
    const data = threadDoc.data();
    if (!isProductionRecord(data)) {
      continue;
    }

    const uid = asNonEmptyString(data.ownerUid);
    if (!uid) {
      continue;
    }

    const channelType = data.channelType === 'actor' ? 'actor' : 'hub';
    const threadActorId = asNonEmptyString(data.actorId) ?? (channelType === 'actor' ? asNonEmptyString(data.channelId) : null);
    if (threadActorId && !actorIds.has(threadActorId)) {
      addAffectedReason(affected, uid, 'missingActorThread', threadDoc.id);
    }

    const messageSnapshot = await threadDoc.ref.collection(CHANNEL_MESSAGES_SUBCOLLECTION).get();
    for (const messageDoc of messageSnapshot.docs) {
      const message = messageDoc.data().message;
      const messageActorId = asNonEmptyString(message?.actor?.actorId);
      if (messageActorId && !actorIds.has(messageActorId)) {
        addAffectedReason(affected, uid, 'missingActorMessage', `${threadDoc.id}/${messageDoc.id}`);
      }

      for (const missionId of collectMissionIds(message)) {
        if (!missionIds.has(missionId)) {
          addAffectedReason(affected, uid, 'missingMissionMessage', `${threadDoc.id}/${messageDoc.id}:${missionId}`);
        }
      }
    }
  }

  const submissionSnapshot = await firestore.collection(SUBMISSIONS_PATH).get();

  for (const submissionDoc of submissionSnapshot.docs) {
    const data = submissionDoc.data();
    if (!isProductionRecord(data)) {
      continue;
    }

    const uid = asNonEmptyString(data.ownerUid);
    const sourceId = asNonEmptyString(data.sourceId);
    if (uid && sourceId && !missionIds.has(sourceId)) {
      addAffectedReason(affected, uid, 'missingMissionSubmission', `${submissionDoc.id}:${sourceId}`);
    }
  }

  return affected;
}

async function buildCleanupPlan(uid, reasons) {
  const [userRecord, channelThreads, submissions, scoreEvents, storageFiles, userDoc, leaderboardDoc] = await Promise.all([
    getUserRecord(uid),
    loadProductionChannelThreads(uid),
    loadProductionSubmissions(uid),
    loadScoreEvents(uid),
    listSubmissionStorageFiles(uid),
    firestore.collection(USERS_PATH).doc(uid).get(),
    firestore.collection(LEADERBOARD_PATH).doc(uid).get(),
  ]);

  const deletedSubmissionSourceIds = new Set();
  const deletedSubmissionKeys = new Set();
  for (const submission of submissions.docs) {
    const data = submission.data;
    const sourceId = asNonEmptyString(data.sourceId);
    const idempotencyKey = asNonEmptyString(data.idempotencyKey);

    if (sourceId) {
      deletedSubmissionSourceIds.add(sourceId);
    }
    if (idempotencyKey) {
      deletedSubmissionKeys.add(idempotencyKey);
      deletedSubmissionKeys.add(`award:${idempotencyKey}`);
    }
    deletedSubmissionKeys.add(submission.ref.id);
    deletedSubmissionKeys.add(`award:${submission.ref.id}`);
  }

  const scoreEventsToDelete = scoreEvents.filter((scoreEvent) => {
    const data = scoreEvent.data;
    const sourceId = asNonEmptyString(data.sourceId);
    const idempotencyKey = asNonEmptyString(data.idempotencyKey);
    return (
      (sourceId && deletedSubmissionSourceIds.has(sourceId)) ||
      (idempotencyKey && deletedSubmissionKeys.has(idempotencyKey)) ||
      deletedSubmissionKeys.has(scoreEvent.ref.id)
    );
  });

  return {
    uid,
    email: userRecord?.email ?? null,
    reasons,
    channelThreads,
    submissions,
    scoreEvents,
    scoreEventsToDelete,
    storageBucketName: storageFiles.bucketName,
    storageFiles: storageFiles.files,
    userDocExists: userDoc.exists,
    userDocData: userDoc.exists ? userDoc.data() : null,
    leaderboardDocExists: leaderboardDoc.exists,
    leaderboardDocData: leaderboardDoc.exists ? leaderboardDoc.data() : null,
  };
}

async function applyCleanupPlan(plan) {
  const channelMessageRefs = plan.channelThreads.flatMap((thread) => thread.messageRefs);
  const channelThreadRefs = plan.channelThreads.map((thread) => thread.ref);
  const submissionRefs = plan.submissions.docs.map((submission) => submission.ref);
  const scoreEventRefs = plan.scoreEventsToDelete.map((scoreEvent) => scoreEvent.ref);

  await deleteRefsInChunks(channelMessageRefs);
  await deleteRefsInChunks(channelThreadRefs);
  await deleteRefsInChunks(submissionRefs);
  await deleteRefsInChunks(scoreEventRefs);

  if (plan.userDocExists) {
    await firestore.collection(USERS_PATH).doc(plan.uid).set(
      {
        awardedGroupBonusIds: FieldValue.delete(),
        pointsCurrent: 0,
        streakCount: 0,
        streakMultiplierCurrent: 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await firestore.collection(LEADERBOARD_PATH).doc(plan.uid).delete().catch(() => undefined);
  await storage.bucket(plan.storageBucketName).deleteFiles({ prefix: storagePrefixForUid(plan.uid) }).catch(() => undefined);
}

async function writeBackup(plans, sanity, targetUser) {
  const backupDir = resolveBackupDir();
  const startedAt = new Date().toISOString();
  const firestoreDocs = collectFirestoreBackupDocs(plans);
  const storageFiles = [];

  await fs.mkdir(backupDir, { recursive: true });

  for (const plan of plans) {
    for (const file of plan.storageFiles) {
      const backupEntry = await backupStorageFile({
        backupDir,
        bucketName: plan.storageBucketName,
        file,
        uid: plan.uid,
      });
      storageFiles.push(backupEntry);
    }
  }

  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    script: 'cleanup-launch-artifacts',
    projectId: PROJECT_ID,
    createdAt: startedAt,
    scope: targetUser
      ? {
          email: targetUser.email,
          uid: targetUser.uid,
        }
      : null,
    sanity: {
      actorIds: [...sanity.actorIds].sort(),
      missionIds: [...sanity.missionIds].sort(),
    },
    users: plans.map((plan) => ({
      uid: plan.uid,
      email: plan.email,
      reasons: serializeReasons(plan.reasons),
      counts: {
        channelMessages: countChannelMessages(plan),
        channelThreads: plan.channelThreads.length,
        leaderboardDocs: plan.leaderboardDocExists ? 1 : 0,
        scoreEvents: plan.scoreEventsToDelete.length,
        storageFiles: plan.storageFiles.length,
        submissions: plan.submissions.docs.length,
        userProgressDocs: plan.userDocExists ? 1 : 0,
      },
    })),
    firestoreDocs,
    storageFiles,
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    backupDir,
    manifestPath,
  };
}

function collectFirestoreBackupDocs(plans) {
  const docsByPath = new Map();

  for (const plan of plans) {
    for (const thread of plan.channelThreads) {
      addFirestoreBackupDoc(docsByPath, thread.ref, thread.data, 'channelThreadDelete');
      for (const message of thread.messageDocs) {
        addFirestoreBackupDoc(docsByPath, message.ref, message.data, 'channelMessageDelete');
      }
    }

    for (const submission of plan.submissions.docs) {
      addFirestoreBackupDoc(docsByPath, submission.ref, submission.data, 'submissionDelete');
    }

    for (const scoreEvent of plan.scoreEventsToDelete) {
      addFirestoreBackupDoc(docsByPath, scoreEvent.ref, scoreEvent.data, 'scoreEventDelete');
    }

    if (plan.userDocExists) {
      addFirestoreBackupDoc(
        docsByPath,
        firestore.collection(USERS_PATH).doc(plan.uid),
        plan.userDocData,
        'userProgressReset'
      );
    }

    if (plan.leaderboardDocExists) {
      addFirestoreBackupDoc(
        docsByPath,
        firestore.collection(LEADERBOARD_PATH).doc(plan.uid),
        plan.leaderboardDocData,
        'leaderboardDelete'
      );
    }
  }

  return [...docsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function addFirestoreBackupDoc(docsByPath, ref, data, reason) {
  const existing = docsByPath.get(ref.path);
  if (existing) {
    existing.reasons = [...new Set([...existing.reasons, reason])].sort();
    return;
  }

  docsByPath.set(ref.path, {
    path: ref.path,
    reasons: [reason],
    data: serializeFirestoreValue(data),
  });
}

async function backupStorageFile({
  backupDir,
  bucketName,
  file,
  uid,
}) {
  const relativePath = path.join(
    'storage',
    encodePathSegment(bucketName),
    ...file.name.split('/').map(encodePathSegment)
  );
  const destination = path.join(backupDir, relativePath);
  const [metadata] = await file.getMetadata();

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await file.download({ destination });

  return {
    bucketName,
    name: file.name,
    uid,
    relativePath,
    size: Number(metadata.size ?? 0),
    md5Hash: metadata.md5Hash ?? null,
    contentType: metadata.contentType ?? null,
    cacheControl: metadata.cacheControl ?? null,
    metadata: metadata.metadata ?? null,
  };
}

async function restoreBackup(target) {
  const manifestPath = await resolveRestoreManifestPath(target);
  const backupDir = path.dirname(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  validateBackupManifest(manifest, manifestPath);

  console.log(`[cleanup-launch-artifacts] RESTORE backup ${manifestPath}`);
  console.log(`Restoring Firestore docs=${manifest.firestoreDocs.length}, storageFiles=${manifest.storageFiles.length}`);

  await restoreFirestoreDocs(manifest.firestoreDocs);
  await restoreStorageFiles({
    backupDir,
    storageFiles: manifest.storageFiles,
  });

  console.log(`Restored cleanup backup created at ${manifest.createdAt}.`);
}

async function resolveRestoreManifestPath(target) {
  const absoluteTarget = path.resolve(process.cwd(), target);
  const stat = await fs.stat(absoluteTarget);
  if (stat.isDirectory()) {
    return path.join(absoluteTarget, 'manifest.json');
  }
  return absoluteTarget;
}

function validateBackupManifest(manifest, manifestPath) {
  if (manifest?.schemaVersion !== BACKUP_SCHEMA_VERSION || manifest?.script !== 'cleanup-launch-artifacts') {
    throw new Error(`Unsupported cleanup backup manifest: ${manifestPath}`);
  }
  if (manifest.projectId !== PROJECT_ID) {
    throw new Error(`Backup projectId=${manifest.projectId} does not match current projectId=${PROJECT_ID}.`);
  }
  if (!Array.isArray(manifest.firestoreDocs) || !Array.isArray(manifest.storageFiles)) {
    throw new Error(`Backup manifest is missing firestoreDocs or storageFiles: ${manifestPath}`);
  }
}

async function restoreFirestoreDocs(firestoreDocs) {
  for (const docsChunk of chunk(firestoreDocs, BATCH_LIMIT)) {
    if (docsChunk.length === 0) {
      continue;
    }

    const batch = firestore.batch();
    for (const entry of docsChunk) {
      batch.set(firestore.doc(entry.path), deserializeFirestoreValue(entry.data));
    }
    await batch.commit();
  }
}

async function restoreStorageFiles({ backupDir, storageFiles }) {
  for (const entry of storageFiles) {
    const sourcePath = path.join(backupDir, entry.relativePath);
    const data = await fs.readFile(sourcePath);
    await storage.bucket(entry.bucketName).file(entry.name).save(data, {
      metadata: buildStorageUploadMetadata(entry),
      resumable: false,
    });
  }
}

function buildStorageUploadMetadata(entry) {
  return {
    ...(entry.cacheControl ? { cacheControl: entry.cacheControl } : {}),
    ...(entry.contentType ? { contentType: entry.contentType } : {}),
    ...(entry.metadata && typeof entry.metadata === 'object' ? { metadata: entry.metadata } : {}),
  };
}

async function loadProductionChannelThreads(uid) {
  const snapshot = await firestore.collection(CHANNEL_THREADS_PATH)
    .where('ownerUid', '==', uid)
    .get();

  const threads = [];
  for (const threadDoc of snapshot.docs) {
    if (!isProductionRecord(threadDoc.data())) {
      continue;
    }

    const messages = await threadDoc.ref.collection(CHANNEL_MESSAGES_SUBCOLLECTION).get();
    const messageDocs = messages.docs.map((messageDoc) => ({
      data: messageDoc.data(),
      ref: messageDoc.ref,
    }));
    threads.push({
      data: threadDoc.data(),
      messageCount: messageDocs.length,
      messageDocs,
      messageRefs: messageDocs.map((messageDoc) => messageDoc.ref),
      ref: threadDoc.ref,
    });
  }

  return threads;
}

async function loadProductionSubmissions(uid) {
  const snapshot = await firestore.collection(SUBMISSIONS_PATH)
    .where('ownerUid', '==', uid)
    .get();

  return {
    docs: snapshot.docs
      .map((doc) => ({
        data: doc.data(),
        ref: doc.ref,
      }))
      .filter((submission) => isProductionRecord(submission.data)),
  };
}

async function loadScoreEvents(uid) {
  const snapshot = await firestore.collection(SCORE_EVENTS_PATH)
    .where('uid', '==', uid)
    .get();

  return snapshot.docs.map((doc) => ({
    data: doc.data(),
    ref: doc.ref,
  }));
}

async function listSubmissionStorageFiles(uid) {
  const prefix = storagePrefixForUid(uid);
  const bucketNames = getStorageBucketCandidates();
  let lastError = null;

  for (const bucketName of bucketNames) {
    try {
      const [files] = await storage.bucket(bucketName).getFiles({ prefix });
      return { bucketName, files };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to list submission storage files for ${uid}. Tried buckets: ${bucketNames.join(', ')}. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function printReport(plans, sanity, targetUser = null) {
  const totals = plans.reduce(
    (sum, plan) => ({
      channelMessages: sum.channelMessages + countChannelMessages(plan),
      channelThreads: sum.channelThreads + plan.channelThreads.length,
      leaderboardDocs: sum.leaderboardDocs + (plan.leaderboardDocExists ? 1 : 0),
      scoreEvents: sum.scoreEvents + plan.scoreEventsToDelete.length,
      storageFiles: sum.storageFiles + plan.storageFiles.length,
      submissions: sum.submissions + plan.submissions.docs.length,
      userDocs: sum.userDocs + (plan.userDocExists ? 1 : 0),
    }),
    {
      channelMessages: 0,
      channelThreads: 0,
      leaderboardDocs: 0,
      scoreEvents: 0,
      storageFiles: 0,
      submissions: 0,
      userDocs: 0,
    }
  );

  console.log(`[cleanup-launch-artifacts] ${apply ? 'APPLY' : 'DRY RUN'} production launch cleanup`);
  if (targetUser) {
    console.log(`Scope: ${targetUser.email ?? 'unknown-email'} (${targetUser.uid})`);
  }
  console.log(`Current production Sanity: actors=${sanity.actorIds.size}, missions=${sanity.missionIds.size}`);
  if (sanity.missionIds.size === 0) {
    console.log('Warning: production Sanity currently has 0 published missions; all production submissions will be considered stale.');
  }
  if (sanity.actorIds.size === 0) {
    console.log('Warning: production Sanity currently has 0 published actors; all production actor channels will be considered stale.');
  }

  console.log(`Affected users: ${plans.length}`);
  if (targetUser && plans.length === 0) {
    console.log('Target user is not currently affected by deleted production Sanity actor/mission refs.');
  }
  for (const plan of plans) {
    const remainingScoreEvents = plan.scoreEvents.length - plan.scoreEventsToDelete.length;
    console.log(`\n- ${plan.email ?? 'unknown-email'} (${plan.uid})`);
    console.log(`  reasons: ${formatReasons(plan.reasons)}`);
    console.log(
      `  delete: channelThreads=${plan.channelThreads.length}, channelMessages=${countChannelMessages(plan)}, ` +
      `submissions=${plan.submissions.docs.length}, scoreEvents=${plan.scoreEventsToDelete.length}, ` +
      `storageFiles=${plan.storageFiles.length} (${plan.storageBucketName}), leaderboardDoc=${plan.leaderboardDocExists ? 1 : 0}`
    );
    console.log(`  reset user progress: ${plan.userDocExists ? 'yes' : 'no user doc found'}`);
    if (remainingScoreEvents > 0) {
      console.log(`  warning: ${remainingScoreEvents} score event(s) for this user do not match deleted production submissions and will remain.`);
    }
  }

  console.log('\nTotals:');
  console.log(`  channelThreads=${totals.channelThreads}`);
  console.log(`  channelMessages=${totals.channelMessages}`);
  console.log(`  submissions=${totals.submissions}`);
  console.log(`  scoreEvents=${totals.scoreEvents}`);
  console.log(`  storageFiles=${totals.storageFiles}`);
  console.log(`  userProgressDocs=${totals.userDocs}`);
  console.log(`  leaderboardDocs=${totals.leaderboardDocs}`);
}

function addAffectedReason(map, uid, reason, detail) {
  if (!map.has(uid)) {
    map.set(uid, {
      missingActorMessage: new Set(),
      missingActorThread: new Set(),
      missingMissionMessage: new Set(),
      missingMissionSubmission: new Set(),
    });
  }

  map.get(uid)[reason].add(detail);
}

function collectMissionIds(message) {
  const ids = new Set();
  const attachment = message?.attachment;
  const missionId = asNonEmptyString(attachment?.missionId);
  if (missionId) {
    ids.add(missionId);
  }

  return ids;
}

async function getUserRecord(uid) {
  try {
    return await auth.getUser(uid);
  } catch {
    return null;
  }
}

async function deleteRefsInChunks(refs) {
  for (const refsChunk of chunk(refs, BATCH_LIMIT)) {
    if (refsChunk.length === 0) {
      continue;
    }

    const batch = firestore.batch();
    refsChunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function countChannelMessages(plan) {
  return plan.channelThreads.reduce((count, thread) => count + thread.messageCount, 0);
}

function formatReasons(reasons) {
  return Object.entries(reasons)
    .filter(([, values]) => values.size > 0)
    .map(([key, values]) => `${key}=${values.size}`)
    .join(', ');
}

function storagePrefixForUid(uid) {
  return `submissions/${uid}/`;
}

function isProductionRecord(data) {
  const mode = data?.mode;
  return mode === undefined || mode === null || mode === PRODUCTION_MODE;
}

function resolveBackupDir() {
  if (backupDirArg) {
    return path.resolve(process.cwd(), backupDirArg);
  }

  return path.join(DEFAULT_BACKUP_ROOT, backupTimestamp());
}

function backupTimestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function serializeReasons(reasons) {
  return Object.fromEntries(
    Object.entries(reasons).map(([reason, details]) => [reason, [...details].sort()])
  );
}

function serializeFirestoreValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value === undefined) {
    return { __firestoreBackupType: 'undefined' };
  }

  if (value instanceof Timestamp || isTimestampLike(value)) {
    return {
      __firestoreBackupType: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (value instanceof GeoPoint || isGeoPointLike(value)) {
    return {
      __firestoreBackupType: 'geoPoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (isBytesLike(value)) {
    return {
      __firestoreBackupType: 'bytes',
      base64: value.toBase64(),
    };
  }

  if (Buffer.isBuffer(value)) {
    return {
      __firestoreBackupType: 'buffer',
      base64: value.toString('base64'),
    };
  }

  if (value instanceof Date) {
    return {
      __firestoreBackupType: 'date',
      value: value.toISOString(),
    };
  }

  if (isDocumentReferenceLike(value)) {
    return {
      __firestoreBackupType: 'documentReference',
      path: value.path,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeFirestoreValue(entry));
  }

  if (typeof value === 'object') {
    const serialized = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        serialized[key] = serializeFirestoreValue(entry);
      }
    }
    return serialized;
  }

  throw new Error(`Unsupported Firestore backup value type: ${typeof value}`);
}

function deserializeFirestoreValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deserializeFirestoreValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  switch (value.__firestoreBackupType) {
    case 'undefined':
      return undefined;
    case 'timestamp':
      return new Timestamp(value.seconds, value.nanoseconds);
    case 'geoPoint':
      return new GeoPoint(value.latitude, value.longitude);
    case 'bytes':
      return Buffer.from(value.base64, 'base64');
    case 'buffer':
      return Buffer.from(value.base64, 'base64');
    case 'date':
      return new Date(value.value);
    case 'documentReference':
      return firestore.doc(value.path);
    default:
      break;
  }

  const deserialized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      deserialized[key] = deserializeFirestoreValue(entry);
    }
  }
  return deserialized;
}

function isTimestampLike(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number' &&
    typeof value.toDate === 'function'
  );
}

function isGeoPointLike(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    value.constructor?.name === 'GeoPoint'
  );
}

function isBytesLike(value) {
  return value && typeof value === 'object' && typeof value.toBase64 === 'function' && value.constructor?.name === 'Bytes';
}

function isDocumentReferenceLike(value) {
  return value && typeof value === 'object' && typeof value.path === 'string' && typeof value.id === 'string' && value.firestore;
}

function encodePathSegment(value) {
  return encodeURIComponent(value);
}

function getStorageBucketCandidates() {
  return [
    process.env.FIREBASE_STORAGE_BUCKET,
    process.env.GCLOUD_STORAGE_BUCKET,
    process.env.STORAGE_BUCKET,
    `${PROJECT_ID}.firebasestorage.app`,
    `${PROJECT_ID}.appspot.com`,
  ].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index);
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function printUsage() {
  console.log('Usage:');
  console.log('  bun run cleanup-launch-artifacts');
  console.log('  bun run cleanup-launch-artifacts -- --email <email>');
  console.log('  bun run cleanup-launch-artifacts -- --uid <uid>');
  console.log('  bun run cleanup-launch-artifacts -- --apply');
  console.log('  bun run cleanup-launch-artifacts -- --email <email> --apply');
  console.log('  bun run cleanup-launch-artifacts -- --restore <backup-dir-or-manifest>');
  console.log('');
  console.log('Dry-run by default. --apply backs up then deletes detected production launch artifacts.');
  console.log(`Default backups are written under ${path.relative(process.cwd(), DEFAULT_BACKUP_ROOT)}.`);
}
