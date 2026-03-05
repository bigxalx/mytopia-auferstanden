import Constants from 'expo-constants';

type AppEnv = {
  appEnv: string;
  feedApiBaseUrl: string;
  firebaseProjectId: string;
  narrativeTopic: string;
  narrativeTopicDev: string;
  sanityDataset: string;
  sanityProjectId: string;
};

const processEnvMap: Record<string, string | undefined> = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_FEED_API_BASE_URL: process.env.EXPO_PUBLIC_FEED_API_BASE_URL,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_NARRATIVE_TOPIC: process.env.EXPO_PUBLIC_NARRATIVE_TOPIC,
  EXPO_PUBLIC_NARRATIVE_TOPIC_DEV: process.env.EXPO_PUBLIC_NARRATIVE_TOPIC_DEV,
  EXPO_PUBLIC_SANITY_DATASET: process.env.EXPO_PUBLIC_SANITY_DATASET,
  EXPO_PUBLIC_SANITY_PROJECT_ID: process.env.EXPO_PUBLIC_SANITY_PROJECT_ID,
};

function readEnvValue(key: string, fallback = '') {
  const fromProcess = processEnvMap[key];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }

  const extra = Constants.expoConfig?.extra;
  const fromExtra = typeof extra?.[key] === 'string' ? extra[key] : undefined;
  return fromExtra ?? fallback;
}

export const env: AppEnv = {
  appEnv: readEnvValue('EXPO_PUBLIC_APP_ENV', 'development'),
  feedApiBaseUrl: readEnvValue('EXPO_PUBLIC_FEED_API_BASE_URL', ''),
  firebaseProjectId: readEnvValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID', ''),
  narrativeTopic: readEnvValue('EXPO_PUBLIC_NARRATIVE_TOPIC', ''),
  narrativeTopicDev: readEnvValue('EXPO_PUBLIC_NARRATIVE_TOPIC_DEV', ''),
  sanityDataset: readEnvValue('EXPO_PUBLIC_SANITY_DATASET', 'production'),
  sanityProjectId: readEnvValue('EXPO_PUBLIC_SANITY_PROJECT_ID', ''),
};

export function hasConfiguredFirebase() {
  return env.firebaseProjectId.length > 0;
}

export function hasConfiguredSanity() {
  return env.sanityProjectId.length > 0;
}

export function hasConfiguredFeedApi() {
  return env.feedApiBaseUrl.length > 0;
}
