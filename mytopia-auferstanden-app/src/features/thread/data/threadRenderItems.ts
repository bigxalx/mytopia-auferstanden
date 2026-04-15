import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { type ThreadTypingState } from '@/src/features/thread/data/threadMessages';

export type FeedItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'message'; data: PlaybackMessage; key: string }
  | { type: 'typing'; actor: PlaybackMessage['message']['actor']; key: string };

export function buildThreadFeedItems(
  items: PlaybackMessage[],
  typingState?: ThreadTypingState | null
): FeedItem[] {
  const nextItems: FeedItem[] = [];
  const sorted = [...items].sort((a, b) => a.revealAtMs - b.revealAtMs);

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const previous = sorted[index - 1];
    const dayKey = getDayKey(item.revealAtMs);
    const previousDayKey = previous ? getDayKey(previous.revealAtMs) : null;

    if (dayKey !== previousDayKey) {
      nextItems.push({
        key: `header-${dayKey}`,
        title: formatDayLabel(item.revealAtMs),
        type: 'header',
      });
    }

    nextItems.push({
      data: item,
      key: item.key,
      type: 'message',
    });
  }

  if (typingState) {
    nextItems.push({
      actor: typingState.actor,
      key: `typing:${typingState.upcomingKey}`,
      type: 'typing',
    });
  }

  return nextItems;
}

function getDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const relativeDay = formatRelativeDay(date);
  if (relativeDay) {
    return relativeDay;
  }

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatRelativeDay(date: Date) {
  const now = new Date();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((d1 - d2) / 86400000);
  if (diff === 0) {
    return 'Heute';
  }
  if (diff === -1) {
    return 'Gestern';
  }
  return null;
}
