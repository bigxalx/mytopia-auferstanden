import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { env } from '@/src/config/env';
import { type AppMode } from '@/src/core/session/appMode';
import * as messaging from '@react-native-firebase/messaging';

const { 
  getMessaging, 
  getToken, 
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  hasPermission: firebaseHasPermission,
  subscribeToTopic: firebaseSubscribeToTopic, 
  unsubscribeFromTopic: firebaseUnsubscribeFromTopic,
  requestPermission: firebaseRequestPermission,
  setBackgroundMessageHandler,
  AuthorizationStatus
} = messaging || {
  getMessaging: () => null,
  getToken: async () => null,
  getInitialNotification: async () => null,
  onMessage: () => () => {},
  onNotificationOpenedApp: () => () => {},
  hasPermission: async () => 0,
  subscribeToTopic: async () => {},
  unsubscribeFromTopic: async () => {},
  requestPermission: async () => 0,
  setBackgroundMessageHandler: () => {},
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0, NOT_DETERMINED: -1 }
};

const DEFAULT_NARRATIVE_TOPIC = 'narrative-global-v1';
const NOTIFICATION_PERMISSION_REQUESTED_KEY = 'mytopia:notifications:requested:v1';

let subscribedTopic: string | null = null;
let inFlightSubscription: Promise<boolean> | null = null;

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
  if (!(await hasNotificationPermission())) {
    return null;
  }

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
    return true;
  }

  inFlightSubscription = switchTopic(topic)
    .then((didSubscribe) => {
      if (didSubscribe) {
        subscribedTopic = topic;
      }
      return didSubscribe;
    })
    .catch((error) => {
      if (isNoDefaultFirebaseAppError(error)) {
        console.warn(
          '[messaging] Firebase app is not initialized in this native build. Topic subscription skipped.'
        );
        return false;
      }

      console.warn('[messaging] Failed to switch narrative topic subscription.', error);
      return false;
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
  if (!(await hasNotificationPermission())) {
    return false;
  }

  const previousTopic = subscribedTopic;
  if (previousTopic && previousTopic !== topic) {
    await unsubscribeFromTopic(previousTopic);
  }

  await subscribeToTopic(topic);
  return true;
}

async function subscribeToTopic(topic: string) {
  const instance = getMessaging();
  if (!(await hasNotificationPermission())) {
    return false;
  }
  await firebaseSubscribeToTopic(instance, topic);
  return true;
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

export type FcmNarrativePayload = {
  bundleId?: string;
  eventType?: string;
  route?: string;
};

export type NotificationPermissionStatus = 'undetermined' | 'granted' | 'denied';

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android') {
    if (Platform.Version < 33) {
      return 'granted';
    }

    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const granted = await PermissionsAndroid.check(permission);
    if (granted) {
      return 'granted';
    }

    return (await AsyncStorage.getItem(NOTIFICATION_PERMISSION_REQUESTED_KEY)) === 'true'
      ? 'denied'
      : 'undetermined';
  }

  if (Platform.OS !== 'ios') {
    return 'granted';
  }

  const status = await firebaseHasPermission(getMessaging());
  return normalizeNotificationStatus(status);
}

export async function hasNotificationPermission() {
  return (await getNotificationPermissionStatus()) === 'granted';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  const currentStatus = await getNotificationPermissionStatus();
  if (currentStatus !== 'undetermined') {
    return currentStatus;
  }

  await AsyncStorage.setItem(NOTIFICATION_PERMISSION_REQUESTED_KEY, 'true');

  if (Platform.OS === 'android') {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const granted = await PermissionsAndroid.request(permission);
    return granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }

  if (Platform.OS !== 'ios') {
    return 'granted';
  }

  const status = await firebaseRequestPermission(getMessaging());
  return normalizeNotificationStatus(status);
}

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

export async function getInitialNarrativeNotificationOpen(): Promise<FcmNarrativePayload | null> {
  try {
    const instance = getMessaging();
    const remoteMessage: any = await getInitialNotification(instance);
    return extractNarrativePayload(remoteMessage);
  } catch (error) {
    if (!isNoDefaultFirebaseAppError(error)) {
      console.warn('[messaging] Failed to fetch initial notification open.', error);
    }
    return null;
  }
}

export function subscribeToNarrativeNotificationOpens(
  callback: (payload: FcmNarrativePayload | null) => void
) {
  try {
    const instance = getMessaging();
    return onNotificationOpenedApp(instance, (remoteMessage: any) => {
      callback(extractNarrativePayload(remoteMessage));
    });
  } catch (error) {
    if (!isNoDefaultFirebaseAppError(error)) {
      console.warn('[messaging] Failed to subscribe to notification opens.', error);
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

function extractNarrativePayload(remoteMessage: any): FcmNarrativePayload | null {
  const data = (remoteMessage?.data ?? {}) as Record<string, string>;
  if (data.eventType === 'release' || data.bundleId || data.route) {
    return {
      bundleId: data.bundleId,
      eventType: data.eventType,
      route: data.route,
    };
  }

  return null;
}

function normalizeNotificationStatus(status: number): NotificationPermissionStatus {
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }

  if (status === AuthorizationStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}
