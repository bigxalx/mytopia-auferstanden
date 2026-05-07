#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GCP_PROJECT before deploying functions.');
  process.exit(1);
}

const result = spawnSync(
  'firebase',
  ['deploy', '--config', 'firebase.json', '--only', 'functions', '--project', projectId],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
