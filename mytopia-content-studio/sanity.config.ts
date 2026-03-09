import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';

import { schemaTypes } from './schemas';

const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
  name: 'default',
  title: dataset === 'development' ? 'Mytopia Content Studio (DEV)' : 'Mytopia Content Studio',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
  dataset: dataset,
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
            S.documentTypeListItem('mission').title('Missions'),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
