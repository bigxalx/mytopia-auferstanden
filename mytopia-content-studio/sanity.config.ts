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
          .title('Editor')
          .items([
            S.listItem()
              .title('Narrative')
              .child(
                S.list()
                  .title('Narrative')
                  .items([
                    S.documentTypeListItem('narrativeBundle').title('Stories'),
                    S.documentTypeListItem('narrativeActor').title('Absender'),
                  ])
              ),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
