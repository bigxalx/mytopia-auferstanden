import messaging from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

import { env } from '@/src/config/env';
import { type AppMode } from '@/src/core/session/appMode';

const DEFAULT_NARRATIVE_TOPIC = 'narrative-global-v1';

let subscribedTopic: string | null = null;
let inFlightSubscription: Promise<void> | null = null;

export function resolveNarrativeTopic(mode: AppMode = 'production') {
  const productionTopic = resolveProductionTopic();
  if (mode === 'dev') {
    const configuredDev = env.narrativeTopicDev.trim();
    if (configuredDev.length > 0) {
      return configuredDev;
    }

    return `${productionTopic}-dev`;
  }

  return productionTopic;
}

export async function ensureNarrativeTopicSubscription(mode: AppMode = 'production') {
  const topic = resolveNarrativeTopic(mode);

  if (inFlightSubscription) {
    await inFlightSubscription;
  }

  if (subscribedTopic === topic) {
    return;
  }

  inFlightSubscription = switchTopic(topic)
    .then(() => {
      subscribedTopic = topic;
    })
    .catch((error) => {
      if (isNoDefaultFirebaseAppError(error)) {
        console.warn(
          '[messaging] Firebase app is not initialized in this native build. Topic subscription skipped.'
        );
        return;
      }

      console.warn('[messaging] Failed to switch narrative topic subscription.', error);
    })
    .finally(() => {
      inFlightSubscription = null;
    });

  return inFlightSubscription;
}

function resolveProductionTopic() {
  const configured = env.narrativeTopic.trim();
  return configured.length > 0 ? configured : DEFAULT_NARRATIVE_TOPIC;
}

async function switchTopic(topic: string) {
  const previousTopic = subscribedTopic;
  if (previousTopic && previousTopic !== topic) {
    await unsubscribeFromTopic(previousTopic);
  }

  await subscribeToTopic(topic);
}

async function subscribeToTopic(topic: string) {
  const instance = messaging();

  await registerForRemoteMessages(instance);
  await requestPermissionsIfNeeded(instance);
  await instance.subscribeToTopic(topic);
}

async function unsubscribeFromTopic(topic: string) {
  try {
    await messaging().unsubscribeFromTopic(topic);
  } catch (error) {
    if (isNoDefaultFirebaseAppError(error)) {
      return;
    }

    console.warn('[messaging] Failed to unsubscribe from previous narrative topic.', error);
  }
}

async function registerForRemoteMessages(instance: ReturnType<typeof messaging>) {
  try {
    await instance.registerDeviceForRemoteMessages();
  } catch (error) {
    if (!isAlreadyRegisteredError(error)) {
      throw error;
    }
  }
}

async function requestPermissionsIfNeeded(instance: ReturnType<typeof messaging>) {
  if (Platform.OS === 'android') {
    if (Platform.Version < 33) {
      return;
    }

    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const granted = await PermissionsAndroid.request(permission);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Android notification permission was not granted.');
    }
    return;
  }

  if (Platform.OS !== 'ios') {
    return;
  }

  const status = await instance.requestPermission();

  const isAuthorized =
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL;

  if (!isAuthorized) {
    throw new Error('Push notification permission was not granted.');
  }
}

function isAlreadyRegisteredError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('already') &&
    message.toLowerCase().includes('register')
  );
}

function isNoDefaultFirebaseAppError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("No Firebase App '[DEFAULT]'");
}
