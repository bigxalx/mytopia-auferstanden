import type { AppMode } from '@/src/core/session/appMode';

export type ExpoUpdateChannel = 'production' | 'dev';

const EXPO_CHANNEL_HEADER = 'expo-channel-name';

export function resolveExpoUpdateChannel(mode: AppMode, canUseDevMode: boolean): ExpoUpdateChannel {
  return mode === 'dev' && canUseDevMode ? 'dev' : 'production';
}

export function createExpoUpdateHeaders(channel: ExpoUpdateChannel) {
  return {
    [EXPO_CHANNEL_HEADER]: channel,
  };
}
