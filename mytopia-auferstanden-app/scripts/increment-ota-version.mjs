#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const appJsonPath = path.join(appDir, 'app.json');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const baselineOtaVersion = 1;

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = assertObject(appJson.expo, 'expo');
const extra = expo.extra && typeof expo.extra === 'object' && !Array.isArray(expo.extra)
  ? expo.extra
  : {};
expo.extra = extra;

const hadExplicitOtaVersion = hasExplicitOtaVersion(extra.otaVersion);
const current = parseOtaVersion(extra.otaVersion);
const next = current + 1;
extra.otaVersion = String(next);

if (!dryRun) {
  fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
}

const currentLabel = hadExplicitOtaVersion ? String(current) : `${current} (default)`;
const action = dryRun ? 'Would update' : 'Updated';
console.log(`[ota-version] ${action} app.json expo.extra.otaVersion ${currentLabel} -> ${next}`);

function parseOtaVersion(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }

    throw new Error(`app.json expo.extra.otaVersion must be an integer string, got "${value}".`);
  }

  return baselineOtaVersion;
}

function hasExplicitOtaVersion(value) {
  return (
    (typeof value === 'number' && Number.isInteger(value) && value >= 0) ||
    (typeof value === 'string' && value.trim().length > 0)
  );
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`app.json must contain an ${label} object.`);
  }

  return value;
}
