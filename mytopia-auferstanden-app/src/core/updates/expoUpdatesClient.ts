import { useMemo } from 'react';

import { createExpoUpdateHeaders, type ExpoUpdateChannel } from '@/src/core/updates/expoUpdateChannel';

type ExpoUpdatesModule = typeof import('expo-updates');

export type ExpoUpdatesState = {
  currentlyRunning: {
    isEmbeddedLaunch: boolean;
  };
  isChecking: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
  isUpdatePending: boolean;
};

const expoUpdatesModule = loadExpoUpdatesModule();
const fallbackUpdatesState: ExpoUpdatesState = {
  currentlyRunning: {
    isEmbeddedLaunch: true,
  },
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  isUpdatePending: false,
};

function loadExpoUpdatesModule(): ExpoUpdatesModule | null {
  try {
    return require('expo-updates') as ExpoUpdatesModule;
  } catch (error) {
    console.warn('[updates] expo-updates native module is unavailable in this build.', error);
    return null;
  }
}

export function useExpoUpdatesState(): ExpoUpdatesState {
  const state = expoUpdatesModule?.useUpdates?.();

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
  return expoUpdatesModule?.isEnabled ?? false;
}

export function getExpoRuntimeVersion() {
  return expoUpdatesModule?.runtimeVersion ?? null;
}

export function setRequestedExpoUpdateChannel(channel: ExpoUpdateChannel) {
  if (!expoUpdatesModule?.isEnabled) {
    return false;
  }

  try {
    expoUpdatesModule.setUpdateRequestHeadersOverride(createExpoUpdateHeaders(channel));
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
  if (!expoUpdatesModule?.isEnabled) {
    return false;
  }

  setRequestedExpoUpdateChannel(channel);

  try {
    const result = await expoUpdatesModule.checkForUpdateAsync();
    if (!result.isAvailable) {
      return false;
    }

    await expoUpdatesModule.fetchUpdateAsync();
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
  if (!expoUpdatesModule?.isEnabled) {
    return false;
  }

  await expoUpdatesModule.reloadAsync();
  return true;
}

function isDevBuildError(error: unknown) {
  const message = String(error);
  return (
    message.includes('not supported in development builds') ||
    message.includes('NotAvailableInDevClientException')
  );
}
