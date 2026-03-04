import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';

import { schemaTypes } from './schemas';

export default defineConfig({
  name: 'default',
  title: 'Mytopia Content Studio',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Inhalt')
          .items([
            S.documentTypeListItem('narrativeBundle').title('Narrative Bundles'),
            S.documentTypeListItem('narrativeActor').title('Narrative Actors'),
            ...S.documentTypeListItems().filter((item) => {
              const id = item.getId();
              return id !== 'narrativeBundle' && id !== 'narrativeActor';
            }),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
