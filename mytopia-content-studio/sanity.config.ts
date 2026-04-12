import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { googleMapsInput } from '@sanity/google-maps-input';
import { colorInput } from '@sanity/color-input';
import { CogIcon } from '@sanity/icons';

import { schemaTypes } from './schemas';

const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
  name: 'default',
  title: dataset === 'development' ? 'Dev - Mytopia Content Studio (Dev)' : 'Mytopia Content Studio',
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
                    S.listItem()
                      .title('Stories')
                      .schemaType('narrativeBundle')
                      .child(
                        S.documentTypeList('narrativeBundle')
                          .title('Stories')
                          .defaultOrdering([{ field: 'releaseAt', direction: 'desc' }])
                      ),
                    S.documentTypeListItem('narrativeActor').title('Absender'),
                  ])
              ),
            S.listItem()
              .title('Missionen & Aufgaben')
              .child(
                S.list()
                  .title('Missionen & Aufgaben')
                  .items([
                    S.documentTypeListItem('mission').title('Alle Einzelmissionen'),
                    S.documentTypeListItem('sammelaufgabe').title('Sammelaufgaben (Mission-Gruppen)'),
                  ])
              ),
            S.listItem()
              .title('Einstellungen')
              .icon(CogIcon)
              .child(
                S.document()
                  .schemaType('siteSettings')
                  .documentId('siteSettings')
              ),
          ]),
    }),
    googleMapsInput({
      apiKey: process.env.SANITY_STUDIO_GOOGLE_MAPS_API_KEY || '',
      defaultZoom: 14,
      defaultLocation: { lat: 50.9847, lng: 12.4364 }, // Altenburg, Germany
    }),
    colorInput(),
  ],
  schema: {
    types: schemaTypes,
  },
});
