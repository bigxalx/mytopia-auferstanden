import { CogIcon } from '@sanity/icons';
import { defineField, defineType } from 'sanity';

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Einstellungen',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({
      name: 'defaultQuizFeedbackCorrect',
      title: 'Standard Quiz-Feedback (Richtig)',
      description: 'Wird angezeigt, wenn eine Quiz-Frage richtig beantwortet wurde und kein spezifisches Feedback bei der Frage oder Mission hinterlegt ist.',
      type: 'string',
    }),
    defineField({
      name: 'defaultQuizFeedbackIncorrect',
      title: 'Standard Quiz-Feedback (Falsch)',
      description: 'Wird angezeigt, wenn eine Quiz-Frage falsch beantwortet wurde und kein spezifisches Feedback bei der Frage oder Mission hinterlegt ist.',
      type: 'string',
    }),
  ],
});
