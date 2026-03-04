import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
  },
});
