import { defineArrayMember, defineField, defineType } from 'sanity';

export const quizOption = defineType({
    name: 'quizOption',
    title: 'Antwortoption',
    type: 'object',
    fields: [
        defineField({
            name: 'text',
            title: 'Antworttext',
            type: 'string',
            description: 'Der Text dieser Antwortoption.',
            validation: (rule) => rule.required().min(1),
        }),
        defineField({
            name: 'isCorrect',
            title: 'Richtige Antwort',
            type: 'boolean',
            description: 'Aktiviere dies für die richtige Antwort.',
            initialValue: false,
        }),
    ],
    preview: {
        select: {
            text: 'text',
            isCorrect: 'isCorrect',
        },
        prepare(selection) {
            return {
                title: `${selection.isCorrect ? '✅' : '○'} ${selection.text || 'Leere Option'}`,
            };
        },
    },
});

export const quizQuestion = defineType({
    name: 'quizQuestion',
    title: 'Quizfrage',
    type: 'object',
    fields: [
        defineField({
            name: 'questionText',
            title: 'Frage',
            type: 'string',
            description: 'Trage den Fragetext ein.',
            validation: (rule) => rule.required().min(1),
        }),
        defineField({
            name: 'options',
            title: 'Antwortoptionen',
            type: 'array',
            of: [defineArrayMember({ type: 'quizOption' })],
            description: 'Trage mindestens zwei Antwortoptionen ein. Genau eine muss als richtig markiert sein.',
            validation: (rule) => rule.required().min(2).max(6),
        }),
    ],
    validation: (rule) =>
        rule.custom((value) => {
            if (!value || typeof value !== 'object') {
                return 'Frage ist ungültig.';
            }

            const maybe = value as { options?: Array<{ isCorrect?: boolean }> };
            const options = Array.isArray(maybe.options) ? maybe.options : [];
            const correctCount = options.filter((opt) => opt.isCorrect === true).length;

            if (correctCount === 0) {
                return 'Markiere genau eine Antwortoption als richtig.';
            }

            if (correctCount > 1) {
                return 'Nur eine Antwortoption darf als richtig markiert sein.';
            }

            return true;
        }),
    preview: {
        select: {
            questionText: 'questionText',
            options: 'options',
        },
        prepare(selection) {
            const optCount = Array.isArray(selection.options) ? selection.options.length : 0;
            return {
                title: selection.questionText || 'Leere Frage',
                subtitle: `${optCount} Optionen`,
            };
        },
    },
});

export const mission = defineType({
    name: 'mission',
    title: 'Mission',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Titel',
            type: 'string',
            description: 'Der Titel der Mission, wie er den Spielern angezeigt wird.',
            validation: (rule) => rule.required().min(1),
        }),
        defineField({
            name: 'kind',
            title: 'Art',
            type: 'string',
            description: 'Wähle die Art der Mission.',
            options: {
                list: [
                    { title: 'Quiz', value: 'quiz' },
                    { title: 'GPS', value: 'gps' },
                ],
                layout: 'radio',
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'points',
            title: 'Punkte',
            type: 'number',
            description: 'Wie viele Punkte diese Mission wert ist.',
            validation: (rule) => rule.required().min(1).integer(),
        }),
        defineField({
            name: 'description',
            title: 'Beschreibung',
            type: 'text',
            rows: 4,
            description: 'Optional: Eine Beschreibung oder Anleitung für die Spieler.',
        }),
        defineField({
            name: 'active',
            title: 'Aktiv',
            type: 'boolean',
            description: 'Nur aktive Missionen werden den Spielern angezeigt.',
            initialValue: false,
        }),

        // --- Quiz-specific fields ---
        defineField({
            name: 'quizConfig',
            title: 'Quiz-Konfiguration',
            type: 'object',
            hidden: ({ parent }) => parent?.kind !== 'quiz',
            fields: [
                defineField({
                    name: 'questions',
                    title: 'Fragen',
                    type: 'array',
                    of: [defineArrayMember({ type: 'quizQuestion' })],
                    description: 'Trage die Quizfragen ein.',
                    validation: (rule) => rule.custom((value, context) => {
                        if (context.document?.kind === 'quiz' && (!value || (value as any[]).length === 0)) {
                            return 'Mindestens eine Frage erforderlich';
                        }
                        return true;
                    }),
                }),
            ],
        }),

        // --- GPS-specific fields ---
        defineField({
            name: 'gpsConfig',
            title: 'GPS-Konfiguration',
            type: 'object',
            hidden: ({ parent }) => parent?.kind !== 'gps',
            fields: [
                defineField({
                    name: 'location',
                    title: 'Zielort',
                    type: 'geopoint',
                    description: 'Klicke auf die Karte, um den Zielort auszuwählen.',
                    validation: (rule) => rule.custom((value, context) => {
                        if (context.document?.kind === 'gps' && !value) {
                            return 'Zielort ist erforderlich';
                        }
                        return true;
                    }),
                }),
                defineField({
                    name: 'radiusMeters',
                    title: 'Radius (Meter)',
                    type: 'number',
                    description: 'Innerhalb dieses Radius gilt der Check-in als erfolgreich.',
                    validation: (rule) => rule.custom((value, context) => {
                        if (context.document?.kind === 'gps') {
                            if (value === undefined) return 'Required';
                            if (typeof value === 'number' && (value < 10 || value > 5000)) return 'Muss zwischen 10 und 5000 liegen';
                        }
                        return true;
                    }),
                    initialValue: 50,
                }),
            ],
        }),
    ],
    preview: {
        select: {
            title: 'title',
            kind: 'kind',
            points: 'points',
            active: 'active',
        },
        prepare(selection) {
            const kindLabel = selection.kind === 'quiz' ? '🧠 Quiz' : selection.kind === 'gps' ? '📍 GPS' : '❓';
            const status = selection.active ? '' : ' (inaktiv)';
            return {
                title: selection.title || 'Unbenannte Mission',
                subtitle: `${kindLabel} · ${selection.points ?? '?'} Punkte${status}`,
            };
        },
    },
});
