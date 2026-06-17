import { describe, expect, test } from 'bun:test';

import {
  parseStoredLiveMembership,
  serializeLiveMembership,
} from '../src/features/live/data/liveMembership.ts';

describe('live membership persistence', () => {
  test('round-trips a run-scoped membership', () => {
    const membership = {
      runId: 'window-123',
      sessionId: 'production-current',
    };

    expect(parseStoredLiveMembership(serializeLiveMembership(membership))).toEqual(membership);
  });

  test('rejects the legacy session-id-only value', () => {
    expect(parseStoredLiveMembership('production-current')).toBeNull();
  });

  test('rejects incomplete or blank membership data', () => {
    expect(parseStoredLiveMembership('{"sessionId":"production-current"}')).toBeNull();
    expect(parseStoredLiveMembership('{"runId":" ","sessionId":"production-current"}')).toBeNull();
  });
});
