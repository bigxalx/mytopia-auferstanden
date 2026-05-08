#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.resolve(scriptDir, '..');

loadEnvFile(path.join(functionsDir, '.env'));
loadEnvFile(path.join(functionsDir, '.env.local'), { override: true });

const projectId = process.env.MYTOPIA_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

if (!projectId) {
  console.error('Set MYTOPIA_FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GCP_PROJECT before deploying Firebase resources.');
  process.exit(1);
}

const result = spawnSync(
  'firebase',
  ['deploy', '--config', 'firebase.json', '--project', projectId, ...process.argv.slice(2)],
  { cwd: functionsDir, stdio: 'inherit' }
);

process.exit(result.status ?? 1);

function loadEnvFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const { override = false } = options;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (!override && process.env[key]) {
      continue;
    }

    process.env[key] = unquote(rawValue.trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
