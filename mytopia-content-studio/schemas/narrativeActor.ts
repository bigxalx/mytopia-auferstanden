import { defineField, defineType } from 'sanity';

export const narrativeActor = defineType({
  name: 'narrativeActor',
  title: 'Narrative Actor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Trage den Anzeigenamen ein, der im Feed sichtbar sein soll.',
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'avatar',
      title: 'Avatar',
      type: 'image',
      description: 'Optional: Lade ein Profilbild für den Feed hoch.',
      options: { hotspot: true },
    }),
    defineField({
      name: 'role',
      title: 'Rolle',
      type: 'string',
      description: 'Optional: Trage eine interne Rollenbeschreibung ein.',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      role: 'role',
    },
    prepare(selection) {
      const role = selection.role ? `Rolle: ${selection.role}` : 'Keine Rolle definiert';
      return {
        title: selection.title || 'Unbenannter Actor',
        subtitle: role,
      };
    },
  },
});
