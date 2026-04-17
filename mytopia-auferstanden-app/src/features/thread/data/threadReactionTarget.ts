import type { PlaybackMessage } from '@/src/features/feed/utils/playback';

export type ThreadReactionFrame = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ThreadReactionTarget = {
  isLastInGroup: boolean;
  playbackMessage: PlaybackMessage;
  showAvatar: boolean;
  showName: boolean;
  sourceFrame: ThreadReactionFrame | null;
};
