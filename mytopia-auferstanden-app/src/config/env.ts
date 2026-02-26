import Constants from 'expo-constants';

type AppEnv = {
  appEnv: string;
  firebaseProjectId: string;
  sanityDataset: string;
  sanityProjectId: string;
};

const processEnvMap: Record<string, string | undefined> = {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
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
  firebaseProjectId: readEnvValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID', ''),
  sanityDataset: readEnvValue('EXPO_PUBLIC_SANITY_DATASET', 'production'),
  sanityProjectId: readEnvValue('EXPO_PUBLIC_SANITY_PROJECT_ID', ''),
};

export function hasConfiguredFirebase() {
  return env.firebaseProjectId.length > 0;
}

export function hasConfiguredSanity() {
  return env.sanityProjectId.length > 0;
}
