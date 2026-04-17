import { type NarrativeReactionId } from './types.js';

export const NARRATIVE_REACTION_IDS = [
  'thumbsUp',
  'thumbsDown',
  'heart',
  'shocked',
  'laughing',
] as const satisfies readonly NarrativeReactionId[];

export function isNarrativeReactionId(value: unknown): value is NarrativeReactionId {
  return typeof value === 'string' && (NARRATIVE_REACTION_IDS as readonly string[]).includes(value);
}

export function emptyReactionCounts() {
  return {} as Partial<Record<NarrativeReactionId, number>>;
}
