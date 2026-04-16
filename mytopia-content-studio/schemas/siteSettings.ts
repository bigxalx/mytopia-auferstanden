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
    defineField({
      name: 'streakRequiredCompletions',
      title: 'Streak: Erforderliche Missionen',
      description: 'Ab wie vielen erfolgreichen Missionen hintereinander der Streak-Multiplikator aktiv wird.',
      type: 'number',
      validation: (rule) => rule.integer().min(1),
      initialValue: 3,
    }),
    defineField({
      name: 'streakMultiplier',
      title: 'Streak-Multiplikator',
      description: 'Wird auf die Basis-Punkte einer Mission angewendet, sobald der Streak aktiv ist.',
      type: 'number',
      validation: (rule) => rule.min(1),
      initialValue: 1.5,
    }),
  ],
});
