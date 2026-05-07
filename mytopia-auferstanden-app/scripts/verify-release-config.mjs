#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
const channel = args.find((arg) => !arg.startsWith('--')) ?? 'production';
const shouldCheckNativeFiles = args.includes('--native') || args.includes('--ota');

const result = spawnSync('bunx', ['expo', 'config', '--json'], {
  cwd: appDir,
  encoding: 'utf8',
  env: {
    ...process.env,
    EXPO_NO_TELEMETRY: '1',
  },
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

const config = parseExpoConfig(result.stdout);
const failures = [];
const warnings = [];
const isProduction = channel === 'production' || config.extra?.EXPO_PUBLIC_APP_ENV === 'production';

if (isProduction) {
  requireValue('updates.url', config.updates?.url);
  requireValue('extra.eas.projectId', config.extra?.eas?.projectId);
  requireValue('ios.bundleIdentifier', config.ios?.bundleIdentifier);
  requireValue('ios.appleTeamId', config.ios?.appleTeamId);
  requireValue('android.package', config.android?.package);
  requireValue('EXPO_PUBLIC_FEED_API_BASE_URL', process.env.EXPO_PUBLIC_FEED_API_BASE_URL);
  requireValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
  requireValue('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  requireValue('EXPO_PUBLIC_MISSION_API_BASE_URL', process.env.EXPO_PUBLIC_MISSION_API_BASE_URL);
  requireValue('EXPO_PUBLIC_NARRATIVE_TOPIC', process.env.EXPO_PUBLIC_NARRATIVE_TOPIC);
  requireValue('EXPO_PUBLIC_NARRATIVE_TOPIC_DEV', process.env.EXPO_PUBLIC_NARRATIVE_TOPIC_DEV);
  requireValue('EXPO_PUBLIC_SANITY_DATASET', process.env.EXPO_PUBLIC_SANITY_DATASET);
  requireValue('EXPO_PUBLIC_SANITY_PROJECT_ID', process.env.EXPO_PUBLIC_SANITY_PROJECT_ID);

  const resolvedChannel = config.updates?.requestHeaders?.['expo-channel-name'];
  if (resolvedChannel !== channel) {
    failures.push(`updates.requestHeaders.expo-channel-name resolved to "${resolvedChannel ?? 'missing'}", expected "${channel}".`);
  }

  if (shouldCheckNativeFiles) {
    requireExistingFile('ios.googleServicesFile', config.ios?.googleServicesFile);
    requireExistingFile('android.googleServicesFile', config.android?.googleServicesFile);
  }
}

if (!process.env.EXPO_TOKEN) {
  warnings.push('EXPO_TOKEN is not set. EAS may still work with a local login, but non-interactive publishing often requires EXPO_TOKEN.');
}

if (failures.length > 0) {
  console.error('[release-config] Config verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

warnings.forEach((warning) => console.warn(`[release-config] Warning: ${warning}`));
console.log(`[release-config] Verified ${isProduction ? 'production' : 'development'} config for channel "${channel}".`);

function parseExpoConfig(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Could not parse Expo config JSON output.');
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function requireValue(label, value) {
  if (isMissingProductionValue(value)) {
    failures.push(`${label} is missing or still generic.`);
  }
}

function requireExistingFile(label, relativeFilePath) {
  requireValue(label, relativeFilePath);

  if (isMissingProductionValue(relativeFilePath)) {
    return;
  }

  const absolutePath = path.isAbsolute(relativeFilePath)
    ? relativeFilePath
    : path.resolve(appDir, relativeFilePath);

  if (!fs.existsSync(absolutePath)) {
    failures.push(`${label} points to a missing file.`);
  }
}

function isMissingProductionValue(value) {
  if (typeof value !== 'string') {
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
