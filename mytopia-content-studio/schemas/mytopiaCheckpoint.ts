import { PinIcon } from '@sanity/icons';
import { defineField, defineType } from 'sanity';

export const mytopiaCheckpoint = defineType({
  name: 'mytopiaCheckpoint',
  title: 'Mytopia Checkpoints',
  type: 'document',
  icon: PinIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Titel',
      type: 'string',
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'description',
      title: 'Beschreibung',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'image',
      title: 'Bild',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'location',
      title: 'GPS-Position',
      type: 'geopoint',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'description',
      media: 'image',
    },
    prepare(selection) {
      return {
        title: selection.title || 'Unbenannter Checkpoint',
        subtitle: selection.subtitle || 'Ohne Beschreibung',
        media: selection.media,
      };
    },
  },
});
