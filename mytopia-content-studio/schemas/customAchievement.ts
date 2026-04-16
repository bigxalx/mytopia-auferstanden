import { StarIcon } from '@sanity/icons';
import { defineField, defineType } from 'sanity';

export const customAchievement = defineType({
  name: 'customAchievement',
  title: 'Abzeichen',
  type: 'document',
  icon: StarIcon,
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
      rows: 3,
    }),
    defineField({
      name: 'bonusPoints',
      title: 'Bonus-Punkte',
      type: 'number',
      description: 'Diese Punkte werden zusätzlich vergeben, wenn Moderatoren das Abzeichen auswählen.',
      validation: (rule) => rule.required().integer().min(0),
      initialValue: 0,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      bonusPoints: 'bonusPoints',
    },
    prepare(selection) {
      return {
        title: selection.title || 'Unbenanntes Abzeichen',
        subtitle: `+${selection.bonusPoints ?? 0} Bonus-Punkte`,
      };
    },
  },
});
