import type { ExpoConfig } from 'expo/config';
import fs from 'fs';
import path from 'path';

const appJson = require('./app.json') as { expo: ExpoConfig };

export default (): ExpoConfig => {
  const base = appJson.expo;
  const iosGoogleServicesFile = resolveGoogleServicesPath(process.env.IOS_GOOGLE_SERVICES_FILE);
  const androidGoogleServicesFile = resolveGoogleServicesPath(process.env.ANDROID_GOOGLE_SERVICES_FILE);

  return {
    ...base,
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
