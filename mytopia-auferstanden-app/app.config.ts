import type { ConfigContext, ExpoConfig } from 'expo/config';
import fs from 'fs';
import path from 'path';

const defaultIosGoogleServicesFile = 'secrets/firebase/GoogleService-Info.plist';
const defaultAndroidGoogleServicesFile = 'secrets/firebase/google-services.json';
const expoChannelHeader = 'expo-channel-name';
const runtimeEnvKeys = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_FEED_API_BASE_URL',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  'EXPO_PUBLIC_MISSION_API_BASE_URL',
  'EXPO_PUBLIC_NARRATIVE_TOPIC',
  'EXPO_PUBLIC_NARRATIVE_TOPIC_DEV',
  'EXPO_PUBLIC_SANITY_DATASET',
  'EXPO_PUBLIC_SANITY_PROJECT_ID',
] as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const baseExtra = (base.extra ?? {}) as Record<string, unknown>;
  const baseEasExtra = typeof baseExtra.eas === 'object' && baseExtra.eas !== null
    ? baseExtra.eas as Record<string, unknown>
    : {};

  const appEnv = readEnv('EXPO_PUBLIC_APP_ENV', 'development');
  const isProduction = appEnv === 'production';
  const appName = readEnv('EXPO_APP_NAME', base.name ?? 'Mytopia App') ?? 'Mytopia App';
  const appScheme = readEnv('EXPO_APP_SCHEME', typeof base.scheme === 'string' ? base.scheme : 'mytopiaapp') ?? 'mytopiaapp';
  const easProjectId = readEnv('EXPO_EAS_PROJECT_ID', stringValue(baseEasExtra.projectId));
  const updatesUrl = readEnv('EXPO_UPDATES_URL', base.updates?.url);
  const updatesChannel = readEnv(
    'EXPO_UPDATES_CHANNEL',
    base.updates?.requestHeaders?.[expoChannelHeader] ?? 'development'
  ) ?? 'development';
  const iosAppleTeamId = readEnv('IOS_APPLE_TEAM_ID', base.ios?.appleTeamId);
  const iosBundleIdentifier = readEnv('IOS_BUNDLE_IDENTIFIER', base.ios?.bundleIdentifier);
  const androidPackage = readEnv('ANDROID_PACKAGE', base.android?.package);

  const iosGoogleServicesFile = resolveGoogleServicesPath(
    process.env.IOS_GOOGLE_SERVICES_FILE ?? defaultIosGoogleServicesFile
  );
  const androidGoogleServicesFile = resolveGoogleServicesPath(
    process.env.ANDROID_GOOGLE_SERVICES_FILE ?? defaultAndroidGoogleServicesFile
  );

  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const runtimeExtra = buildRuntimeExtra(baseExtra);

  if (isProduction) {
    assertProductionConfig({
      ANDROID_GOOGLE_SERVICES_FILE: androidGoogleServicesFile,
      ANDROID_PACKAGE: androidPackage,
      EXPO_EAS_PROJECT_ID: easProjectId,
      EXPO_PUBLIC_FEED_API_BASE_URL: runtimeExtra.EXPO_PUBLIC_FEED_API_BASE_URL,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: runtimeExtra.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: runtimeExtra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      EXPO_PUBLIC_MISSION_API_BASE_URL: runtimeExtra.EXPO_PUBLIC_MISSION_API_BASE_URL,
      EXPO_PUBLIC_NARRATIVE_TOPIC: runtimeExtra.EXPO_PUBLIC_NARRATIVE_TOPIC,
      EXPO_PUBLIC_NARRATIVE_TOPIC_DEV: runtimeExtra.EXPO_PUBLIC_NARRATIVE_TOPIC_DEV,
      EXPO_PUBLIC_SANITY_DATASET: runtimeExtra.EXPO_PUBLIC_SANITY_DATASET,
      EXPO_PUBLIC_SANITY_PROJECT_ID: runtimeExtra.EXPO_PUBLIC_SANITY_PROJECT_ID,
      EXPO_UPDATES_CHANNEL: updatesChannel,
      EXPO_UPDATES_URL: updatesUrl,
      IOS_APPLE_TEAM_ID: iosAppleTeamId,
      IOS_BUNDLE_IDENTIFIER: iosBundleIdentifier,
      IOS_GOOGLE_SERVICES_FILE: iosGoogleServicesFile,
    });
  }

  const plugins = [...(base.plugins ?? [])];
  if (googleMapsApiKey) {
    plugins.push([
      'react-native-maps',
      { androidGoogleMapsApiKey: googleMapsApiKey },
    ]);
  }

  return {
    ...base,
    name: appName,
    scheme: appScheme,
    plugins,
    ...(updatesUrl
      ? {
          updates: {
            ...base.updates,
            url: updatesUrl,
            requestHeaders: {
              ...(base.updates?.requestHeaders ?? {}),
              [expoChannelHeader]: updatesChannel,
            },
          },
        }
      : { updates: undefined }),
    ios: {
      ...base.ios,
      ...(iosAppleTeamId ? { appleTeamId: iosAppleTeamId } : {}),
      ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
      associatedDomains: [
        ...new Set([
          ...((base.ios?.associatedDomains as string[] | undefined) ?? []),
          'applinks:mytopia.world',
          'applinks:www.mytopia.world',
        ]),
      ],
      entitlements: {
        ...(base.ios?.entitlements as object),
        'aps-environment': isProduction ? 'production' : 'development',
      },
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    android: {
      ...base.android,
      ...(androidPackage ? { package: androidPackage } : {}),
      intentFilters: [
        ...((base.android?.intentFilters as NonNullable<ExpoConfig['android']>['intentFilters']) ?? []),
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            {
              host: 'mytopia.world',
              pathPrefix: '/live/session',
              scheme: 'https',
            },
            {
              host: 'www.mytopia.world',
              pathPrefix: '/live/session',
              scheme: 'https',
            },
          ],
        },
      ],
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    extra: {
      ...baseExtra,
      ...runtimeExtra,
      eas: {
        ...baseEasExtra,
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
      otaVersion: stringValue(baseExtra.otaVersion) ?? '1',
    },
  };
};

function buildRuntimeExtra(baseExtra: Record<string, unknown>) {
  return Object.fromEntries(
    runtimeEnvKeys.map((key) => [key, readEnv(key, stringValue(baseExtra[key]) ?? '')])
  ) as Record<typeof runtimeEnvKeys[number], string>;
}

function readEnv(key: string, fallback?: string) {
  const value = process.env[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveGoogleServicesPath(filePath?: string) {
  if (!filePath) {
    return undefined;
  }
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }
  return path.relative(__dirname, absolutePath);
}

function assertProductionConfig(values: Record<string, string | undefined>) {
  const missing = Object.entries(values)
    .filter(([, value]) => isMissingProductionValue(value))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing production Expo config values: ${missing.join(', ')}. ` +
      'Set them in mytopia-auferstanden-app/.env.local before building or publishing production updates.'
    );
  }
}

function isMissingProductionValue(value: string | undefined) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes('<') ||
    normalized.includes('example') ||
    normalized.startsWith('your-')
  );
}
