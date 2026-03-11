import type { ExpoConfig } from 'expo/config';
import fs from 'fs';
import path from 'path';

const appJson = require('./app.json') as { expo: ExpoConfig };
const defaultIosGoogleServicesFile = 'secrets/firebase/GoogleService-Info.plist';
const defaultAndroidGoogleServicesFile = 'secrets/firebase/google-services.json';

export default (): ExpoConfig => {
  const base = appJson.expo;
  const iosGoogleServicesFile = resolveGoogleServicesPath(
    process.env.IOS_GOOGLE_SERVICES_FILE ?? defaultIosGoogleServicesFile
  );
  const androidGoogleServicesFile = resolveGoogleServicesPath(
    process.env.ANDROID_GOOGLE_SERVICES_FILE ?? defaultAndroidGoogleServicesFile
  );

  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  // Inject react-native-maps config plugin for Android when API key is available
  const plugins = [...(base.plugins ?? [])];
  if (googleMapsApiKey) {
    plugins.push([
      'react-native-maps',
      { androidGoogleMapsApiKey: googleMapsApiKey },
    ]);
  }

  return {
    ...base,
    plugins,
    ios: {
      ...base.ios,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    android: {
      ...base.android,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
  };
};

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
