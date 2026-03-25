import { useMemo } from 'react';
import * as ExpoUpdates from 'expo-updates';

import { createExpoUpdateHeaders, type ExpoUpdateChannel } from '@/src/core/updates/expoUpdateChannel';

export type ExpoUpdatesState = {
  currentlyRunning: {
    isEmbeddedLaunch: boolean;
  };
  isChecking: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
  isUpdatePending: boolean;
};

const fallbackUpdatesState: ExpoUpdatesState = {
  currentlyRunning: {
    isEmbeddedLaunch: true,
  },
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  isUpdatePending: false,
};

export function useExpoUpdatesState(): ExpoUpdatesState {
  const state = ExpoUpdates.useUpdates();

  return useMemo(() => {
    if (!state) {
      return fallbackUpdatesState;
    }

    return {
      currentlyRunning: {
        isEmbeddedLaunch: state.currentlyRunning.isEmbeddedLaunch,
      },
      isChecking: state.isChecking,
      isDownloading: state.isDownloading,
      isRestarting: state.isRestarting,
      isUpdatePending: state.isUpdatePending,
    };
  }, [state]);
}

export function isExpoUpdatesEnabled() {
  return ExpoUpdates.isEnabled;
}

export function getExpoRuntimeVersion() {
  return ExpoUpdates.runtimeVersion ?? null;
}

export function setRequestedExpoUpdateChannel(channel: ExpoUpdateChannel) {
  if (!ExpoUpdates.isEnabled) {
    return false;
  }

  try {
    ExpoUpdates.setUpdateRequestHeadersOverride(createExpoUpdateHeaders(channel));
    return true;
  } catch (error) {
    if (isDevBuildError(error)) {
      return false;
    }
    console.warn('[updates] Cannot set update request headers override in this build.', error);
    return false;
  }
}

export async function checkAndFetchExpoUpdate(channel: ExpoUpdateChannel) {
  if (!ExpoUpdates.isEnabled) {
    return false;
  }

  setRequestedExpoUpdateChannel(channel);

  try {
    const result = await ExpoUpdates.checkForUpdateAsync();
    if (!result.isAvailable) {
      return false;
    }

    await ExpoUpdates.fetchUpdateAsync();
    return true;
  } catch (error) {
    if (isDevBuildError(error)) {
      return false;
    }
    console.warn('[updates] Unexpected error during update check.', error);
    return false;
  }
}

export async function reloadToApplyExpoUpdate() {
  if (!ExpoUpdates.isEnabled) {
    return false;
  }

  await ExpoUpdates.reloadAsync();
  return true;
}

function isDevBuildError(error: unknown) {
  const message = String(error);
  return (
    message.includes('not supported in development builds') ||
    message.includes('NotAvailableInDevClientException')
  );
}
