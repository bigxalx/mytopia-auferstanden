import { defineField, defineType } from 'sanity';
import { PackageIcon } from '@sanity/icons';

export const sammelaufgabe = defineType({
    name: 'sammelaufgabe',
    title: 'Sammelaufgabe',
    type: 'document',
    icon: PackageIcon,
    fields: [
        defineField({
            name: 'title',
            title: 'Titel',
            type: 'string',
            description: 'Der Titel dieser Sammelaufgabe.',
            validation: (rule) => rule.required().min(1),
        }),
        defineField({
            name: 'description',
            title: 'Beschreibung',
            type: 'text',
            rows: 3,
            description: 'Eine kurze Beschreibung dieser Sammelaufgabe für die Spieler.',
        }),
        defineField({
            name: 'active',
            title: 'Aktiv',
            type: 'boolean',
            description: 'Nur aktive Sammelaufgaben werden den Spielern angezeigt.',
            initialValue: true,
        }),
        defineField({
            name: 'missions',
            title: 'Missionen',
            type: 'array',
            of: [{ type: 'reference', to: [{ type: 'mission' }] }],
            description: 'Füge hier alle Missionen hinzu, die zu dieser Sammelaufgabe gehören sollen.',
        }),
    ],
    preview: {
        select: {
            title: 'title',
            active: 'active',
            media: 'missions.0->image',
        },
        prepare(selection) {
            const status = selection.active ? '🟢' : '🔴';
            return {
                title: `${status} ${selection.title || 'Unbenannt'}`,
                subtitle: 'Sammelaufgabe',
                media: selection.media,
            };
        },
    },
});
