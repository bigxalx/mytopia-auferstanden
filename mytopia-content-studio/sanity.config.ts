import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { googleMapsInput } from '@sanity/google-maps-input';

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
    googleMapsInput({
      apiKey: process.env.SANITY_STUDIO_GOOGLE_MAPS_API_KEY || '',
      defaultZoom: 14,
      defaultLocation: { lat: 50.9847, lng: 12.4364 }, // Altenburg, Germany
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
