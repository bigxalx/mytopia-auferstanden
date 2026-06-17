import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'demo-mytopia-live-rules';
const SESSION_ID = 'production-current';
const CURRENT_RUN_ID = 'window-current';
const PREVIOUS_RUN_ID = 'window-previous';

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}`), {
      activeRunId: CURRENT_RUN_ID,
      endsAt: Timestamp.fromMillis(Date.now() + 60_000),
      mode: 'production',
      status: 'active',
    });
    await Promise.all([
      setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/participants/current-user`), {
        connectionState: 'connected',
        runId: CURRENT_RUN_ID,
        uid: 'current-user',
      }),
      setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/participants/offline-user`), {
        connectionState: 'offline',
        runId: CURRENT_RUN_ID,
        uid: 'offline-user',
      }),
      setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/participants/previous-user`), {
        connectionState: 'connected',
        runId: PREVIOUS_RUN_ID,
        uid: 'previous-user',
      }),
      setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/current-event`), {
        runId: CURRENT_RUN_ID,
        status: 'active',
        type: 'terror_alert',
      }),
      setDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/previous-event`), {
        runId: PREVIOUS_RUN_ID,
        status: 'cleared',
        type: 'terror_alert',
      }),
    ]);
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('live event isolation', () => {
  test('allows a connected participant in the current run', async () => {
    const db = testEnvironment.authenticatedContext('current-user').firestore();
    const snapshot = await assertSucceeds(
      getDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/current-event`))
    );
    expect(snapshot.exists()).toBe(true);
  });

  test('denies offline, previous-run, and unjoined users', async () => {
    for (const uid of ['offline-user', 'previous-user', 'unjoined-user']) {
      const db = testEnvironment.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/current-event`)));
    }
  });

  test('denies an old event to a participant in the current run', async () => {
    const db = testEnvironment.authenticatedContext('current-user').firestore();
    await assertFails(getDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/previous-event`)));
  });

  test('denies event access after the run end time', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `v2/app/liveSessions/${SESSION_ID}`), {
        endsAt: Timestamp.fromMillis(Date.now() - 1_000),
      }, { merge: true });
    });
    const db = testEnvironment.authenticatedContext('current-user').firestore();
    await assertFails(getDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/current-event`)));
  });

  test('allows a moderator to inspect historical events', async () => {
    const db = testEnvironment
      .authenticatedContext('moderator-user', { moderator: true })
      .firestore();
    const snapshot = await assertSucceeds(
      getDoc(doc(db, `v2/app/liveSessions/${SESSION_ID}/events/previous-event`))
    );
    expect(snapshot.exists()).toBe(true);
  });
});
