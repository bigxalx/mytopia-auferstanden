export const NARRATIVE_REACTION_OPTIONS = [
  { emoji: '👍', id: 'thumbsUp', label: 'Daumen hoch' },
  { emoji: '👎', id: 'thumbsDown', label: 'Daumen runter' },
  { emoji: '❤️', id: 'heart', label: 'Herz' },
  { emoji: '😮', id: 'shocked', label: 'Überrascht' },
  { emoji: '😂', id: 'laughing', label: 'Lachend' },
] as const;

export type NarrativeReactionId = (typeof NARRATIVE_REACTION_OPTIONS)[number]['id'];

export type NarrativeReactionCounts = Partial<Record<NarrativeReactionId, number>>;

export type NarrativeMessageReactionState = {
  counts: NarrativeReactionCounts;
  viewerReaction: NarrativeReactionId | null;
};

export function getEmptyNarrativeReactionState(): NarrativeMessageReactionState {
  return {
    counts: {},
    viewerReaction: null,
  };
}

const NARRATIVE_REACTION_ID_SET = new Set<string>(
  NARRATIVE_REACTION_OPTIONS.map((option) => option.id)
);

export function isNarrativeReactionId(value: unknown): value is NarrativeReactionId {
  return typeof value === 'string' && NARRATIVE_REACTION_ID_SET.has(value);
}

export function buildNarrativeReactionMessageKey(bundleId: string, messageId: string) {
  return `${bundleId}:${messageId}`;
}

export function getNarrativeReactionOption(reactionId: NarrativeReactionId) {
  return NARRATIVE_REACTION_OPTIONS.find((option) => option.id === reactionId) ?? null;
}

export function resolveNarrativeReactionSelection(
  currentReaction: NarrativeReactionId | null,
  selectedReaction: NarrativeReactionId
) {
  return currentReaction === selectedReaction ? null : selectedReaction;
}

export function applyNarrativeReactionSelection(
  currentState: NarrativeMessageReactionState,
  nextReaction: NarrativeReactionId | null
): NarrativeMessageReactionState {
  const nextCounts = { ...currentState.counts };
  const previousReaction = currentState.viewerReaction;

  if (previousReaction) {
    const previousCount = nextCounts[previousReaction] ?? 0;
    if (previousCount <= 1) {
      delete nextCounts[previousReaction];
    } else {
      nextCounts[previousReaction] = previousCount - 1;
    }
  }

  if (nextReaction) {
    nextCounts[nextReaction] = (nextCounts[nextReaction] ?? 0) + 1;
  }

  return {
    counts: nextCounts,
    viewerReaction: nextReaction,
  };
}
