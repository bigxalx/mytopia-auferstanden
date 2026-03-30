import { PermissionsAndroid, Platform } from 'react-native';
import { env } from '@/src/config/env';
import { type AppMode } from '@/src/core/session/appMode';
import * as messaging from '@react-native-firebase/messaging';

const { 
  getMessaging, 
  getToken, 
  onMessage,
  subscribeToTopic: firebaseSubscribeToTopic, 
  unsubscribeFromTopic: firebaseUnsubscribeFromTopic,
  requestPermission: firebaseRequestPermission,
  setBackgroundMessageHandler,
  AuthorizationStatus
} = messaging || {
  getMessaging: () => null,
  getToken: async () => null,
  onMessage: () => () => {},
  subscribeToTopic: async () => {},
  unsubscribeFromTopic: async () => {},
  requestPermission: async () => 0,
  setBackgroundMessageHandler: () => {},
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0, NOT_DETERMINED: -1 }
};

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

export async function getFCMToken(): Promise<string | null> {
  try {
    return await getToken(getMessaging());
  } catch (error) {
    if (isNoDefaultFirebaseAppError(error)) {
      return null;
    }
    throw error;
  }
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
  const instance = getMessaging();

  await requestPermissionsIfNeeded(instance);
  await firebaseSubscribeToTopic(instance, topic);
}

async function unsubscribeFromTopic(topic: string) {
  try {
    await firebaseUnsubscribeFromTopic(getMessaging(), topic);
  } catch (error) {
    if (isNoDefaultFirebaseAppError(error)) {
      return;
    }

    console.warn('[messaging] Failed to unsubscribe from previous narrative topic.', error);
  }
}


async function requestPermissionsIfNeeded(instance: ReturnType<typeof getMessaging>) {
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

  const status = await firebaseRequestPermission(instance);

  const isAuthorized =
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL;

  if (!isAuthorized) {
    throw new Error('Push notification permission was not granted.');
  }
}


export type FcmNarrativePayload = {
  bundleId?: string;
  eventType?: string;
  route?: string;
};

export function subscribeToForegroundNarrativeMessages(
  callback: (payload: FcmNarrativePayload) => void
) {
  try {
    const instance = getMessaging();
    return onMessage(instance, (remoteMessage: any) => {
      const data = (remoteMessage.data ?? {}) as Record<string, string>;
      if (data.eventType === 'release' || data.bundleId) {
        callback({
          bundleId: data.bundleId,
          eventType: data.eventType,
          route: data.route,
        });
      }
    });
  } catch (error) {
    if (!isNoDefaultFirebaseAppError(error)) {
      console.warn('[messaging] Failed to subscribe to foreground messages.', error);
    }
    return () => undefined;
  }
}

let backgroundHandlerRegistered = false;

export function registerBackgroundNarrativeHandler() {
  if (backgroundHandlerRegistered) return;
  backgroundHandlerRegistered = true;

  try {
    const instance = getMessaging();
    setBackgroundMessageHandler(instance, async () => {
      // Background messages surface as OS notifications.
      // When the user taps or returns to the app, AppState change
      // and useFocusEffect already trigger a feed refresh.
    });
  } catch (error) {
    backgroundHandlerRegistered = false;
    if (!isNoDefaultFirebaseAppError(error)) {
      console.warn('[messaging] Failed to register background message handler.', error);
    }
  }
}

function isNoDefaultFirebaseAppError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("No Firebase App '[DEFAULT]'");
}

