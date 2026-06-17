export type StoredLiveMembership = {
  runId: string;
  sessionId: string;
};

export function serializeLiveMembership(membership: StoredLiveMembership) {
  return JSON.stringify(membership);
}

export function parseStoredLiveMembership(value: string | null): StoredLiveMembership | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { runId?: unknown; sessionId?: unknown };
    if (
      typeof parsed.runId === 'string'
      && parsed.runId.trim().length > 0
      && typeof parsed.sessionId === 'string'
      && parsed.sessionId.trim().length > 0
    ) {
      return {
        runId: parsed.runId.trim(),
        sessionId: parsed.sessionId.trim(),
      };
    }
  } catch {
    // Legacy values stored only the deterministic session id and must rejoin.
  }
  return null;
}
