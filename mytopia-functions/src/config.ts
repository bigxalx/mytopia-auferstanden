import {
    EnvConfig,
    NarrativeMode
} from './types.js';
let cachedEnv: EnvConfig | null = null;

export function requiredEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new Error(`Missing required environment variable. Tried: ${keys.join(', ')}`);
}

export function optionalEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function env(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const fcmTopicNarrativeDev = optionalEnv('FCM_TOPIC_NARRATIVE_DEV');
  const sanityDatasetDev = optionalEnv('SANITY_DATASET_DEV');

  cachedEnv = {
    cloudTasksLocation: requiredEnv('CLOUD_TASKS_LOCATION'),
    cloudTasksQueue: requiredEnv('CLOUD_TASKS_QUEUE'),
    fcmTopicNarrative: requiredEnv('FCM_TOPIC_NARRATIVE'),
    ...(fcmTopicNarrativeDev ? { fcmTopicNarrativeDev } : {}),
    projectId: requiredEnv('GCLOUD_PROJECT', 'GCP_PROJECT'),
    releaseFunctionUrl: requiredEnv('RELEASE_FUNCTION_URL'),
    sanityApiToken: requiredEnv('SANITY_API_TOKEN'),
    sanityDataset: requiredEnv('SANITY_DATASET'),
    ...(sanityDatasetDev ? { sanityDatasetDev } : {}),
    sanityProjectId: requiredEnv('SANITY_PROJECT_ID'),
    sanityWebhookSecret: requiredEnv('SANITY_WEBHOOK_SECRET'),
    tasksServiceAccountEmail: requiredEnv('TASKS_SERVICE_ACCOUNT_EMAIL'),
  };

  return cachedEnv;
}

export function resolveMode(raw: unknown): NarrativeMode {
  return raw === 'dev' ? 'dev' : 'production';
}

export function resolveSanityDataset(mode: NarrativeMode) {
  if (mode === 'dev') {
    const devDataset = env().sanityDatasetDev;
    if (!devDataset || devDataset.length === 0) {
      throw new Error('SANITY_DATASET_DEV is required when mode=dev.');
    }

    return devDataset;
  }

  return env().sanityDataset;
}

export function resolveNarrativeTopic(mode: NarrativeMode) {
  if (mode === 'dev') {
    const devTopic = env().fcmTopicNarrativeDev;
    if (typeof devTopic === 'string' && devTopic.length > 0) {
      return devTopic;
    }

    return `${env().fcmTopicNarrative}-dev`;
  }

  return env().fcmTopicNarrative;
}
