import { defineArrayMember, defineField, defineType } from 'sanity';
import { ChatEditor } from '../components/ChatEditor';

export const imageAttachment = defineType({
  name: 'imageAttachment',
  title: 'Bild',
  type: 'object',
  fields: [
    defineField({
      name: 'asset',
      title: 'Bilddatei',
      type: 'image',
      description: 'Lade das Bild hoch, das im Feed gezeigt werden soll.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'caption',
      title: 'Bildunterschrift',
      type: 'string',
      description: 'Optional: Ergänze eine kurze Bildunterschrift.',
    }),
  ],
});

export const audioAttachment = defineType({
  name: 'audioAttachment',
  title: 'Audio',
  type: 'object',
  fields: [
    defineField({
      name: 'asset',
      title: 'Audiodatei',
      type: 'file',
      description:
        'Lade eine MP3-, AAC- oder WAV-Datei hoch. iPhone-Sprachmemos als M4A/ALAC laufen auf iOS, aber nicht zuverlässig auf Android.',
      options: {
        accept: '.mp3,.aac,.wav',
      },
      validation: (rule) =>
        rule.required().custom((value) => {
          if (!value || typeof value !== 'object') {
            return true;
          }

          const assetRef = (value as { asset?: { _ref?: unknown } }).asset?._ref;
          if (typeof assetRef !== 'string') {
            return true;
          }

          const extension = assetRef.split('-').pop()?.toLowerCase();
          if (!extension) {
            return true;
          }

          return ['mp3', 'aac', 'wav'].includes(extension)
            ? true
            : 'Bitte MP3, AAC oder WAV hochladen. M4A aus iPhone-Sprachmemos ist oft ALAC und spielt auf Android nicht.';
        }),
    }),
    defineField({
      name: 'title',
      title: 'Titel',
      type: 'string',
      description: 'Optional: Trage einen Titel für die Audio-Datei ein.',
    }),
  ],
});

export const videoAttachment = defineType({
  name: 'videoAttachment',
  title: 'Video',
  type: 'object',
  fields: [
    defineField({
      name: 'asset',
      title: 'Videodatei',
      type: 'file',
      description: 'Lade die Videodatei hoch, die in der Nachricht angezeigt wird.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titel',
      type: 'string',
      description: 'Optional: Trage einen Titel für das Video ein.',
    }),
  ],
});

export const missionAttachment = defineType({
  name: 'missionAttachment',
  title: 'Mission',
  type: 'object',
  fields: [
    defineField({
      name: 'mission',
      title: 'Mission',
      type: 'reference',
      to: [{ type: 'mission' }],
      description: 'Wähle die verknüpfte Mission aus.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titel',
      type: 'string',
      description: 'Optional: Überschreibe den Titel der Missionskarte.',
    }),
    defineField({
      name: 'excerpt',
      title: 'Kurztext',
      type: 'text',
      rows: 3,
      description: 'Optional: Trage einen kurzen Teasertext ein.',
    }),
  ],
});

export const narrativeMessage = defineType({
  name: 'narrativeMessage',
  title: 'Nachricht',
  type: 'object',
  fields: [
    defineField({
      name: 'messageId',
      title: 'Message ID',
      type: 'string',
      description: 'Diese technische Kennung wird automatisch erzeugt.',
      initialValue: () =>
        `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      validation: (rule) => rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'actor',
      title: 'Absender',
      type: 'reference',
      to: [{ type: 'narrativeActor' }],
      description: 'Wähle die Figur, die diese Nachricht sendet.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'text',
      title: 'Nachrichtentext',
      type: 'text',
      rows: 6,
      description: 'Trage den Nachrichtentext ein (optional, wenn ein Attachment gesetzt ist).',
    }),
    defineField({
      name: 'attachment',
      title: 'Attachment',
      type: 'array',
      description: 'Optional: Wähle genau ein Attachment (Bild, Audio, Video oder Mission).',
      of: [
        defineArrayMember({ type: 'imageAttachment' }),
        defineArrayMember({ type: 'audioAttachment' }),
        defineArrayMember({ type: 'videoAttachment' }),
        defineArrayMember({ type: 'missionAttachment' }),
      ],
      validation: (rule) => rule.max(1),
    }),
  ],
  validation: (rule) =>
    rule.custom((value) => {
      if (!value || typeof value !== 'object') {
        return 'Nachricht ist ungültig.';
      }

      const maybe = value as { text?: string; attachment?: unknown[] };
      const hasText = typeof maybe.text === 'string' && maybe.text.trim().length > 0;
      const hasAttachment = Array.isArray(maybe.attachment) && maybe.attachment.length > 0;

      if (!hasText && !hasAttachment) {
        return 'Eine Nachricht braucht Text oder ein Attachment.';
      }

      return true;
    }),
  preview: {
    select: {
      actorName: 'actor.name',
      text: 'text',
      attachmentType: 'attachment.0._type',
    },
    prepare(selection) {
      const actor = selection.actorName || 'Unbekannter Absender';
      const subtitle = selection.text || selection.attachmentType || 'Leere Nachricht';
      return {
        title: actor,
        subtitle,
      };
    },
  },
});

export const narrativeBundle = defineType({
  name: 'narrativeBundle',
  title: 'Story',
  type: 'document',
  fields: [
    defineField({
      name: 'releaseAt',
      title: 'Release At',
      type: 'datetime',
      description:
        'Wähle den Veröffentlichungszeitpunkt (Europe/Berlin). Dann werden Release und Push ausgelöst.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'scriptActor',
      title: 'Standard-Absender',
      type: 'reference',
      to: [{ type: 'narrativeActor' }],
      description: 'Wähle den Absender, der für neue Nachrichten im Chat-Editor verwendet wird.',
    }),
    defineField({
      name: 'messages',
      title: 'Nachrichten & Anhänge (Chat-Editor)',
      type: 'array',
      description:
        'Der neue Standard-Editor. Nutze dieses Feld für strukturierte Nachrichten mit Bildern, Audio oder Missionen.',
      of: [defineArrayMember({ type: 'narrativeMessage' })],
      components: {
        input: ChatEditor,
      },
    }),
    defineField({
      name: 'pushTitle',
      title: 'Push-Titel',
      type: 'string',
      description: 'Optional: Leer = "Neue Nachricht von [Name]".',
    }),
    defineField({
      name: 'pushBody',
      title: 'Push-Text',
      type: 'text',
      rows: 2,
      description: 'Optional: Leer = Erster Text der Nachricht oder ein passendes Emoji (📸, 🎥, 🧠, etc.).',
    }),
    defineField({
      name: 'script',
      title: 'Nachrichten-Skript (LEGACY / ALT)',
      type: 'text',
      rows: 10,
      description:
        '⚠️ ALT: Nutze dieses Feld nur, wenn du den neuen Chat-Editor nicht verwenden möchtest. Das neue Feld (Nachrichten & Anhänge) überschreibt dieses Skript komplett.',
    }),
  ],
  orderings: [
    {
      title: 'Release-Datum (Absteigend)',
      name: 'releaseAtDesc',
      by: [{ field: 'releaseAt', direction: 'desc' }],
    },
    {
      title: 'Release-Datum (Aufsteigend)',
      name: 'releaseAtAsc',
      by: [{ field: 'releaseAt', direction: 'asc' }],
    },
  ],
  preview: {
    select: {
      script: 'script',
      releaseAt: 'releaseAt',
    },
    prepare(selection) {
      const firstLine =
        typeof selection.script === 'string'
          ? selection.script
            .split('\n')
            .map((line: string) => line.trim())
            .find((line: string) => line.length > 0)
          : null;

      return {
        title: firstLine || 'Narrative Bundle',
        subtitle: selection.releaseAt || 'Kein Release-Zeitpunkt',
      };
    },
  },
  validation: (rule) =>
    rule.custom((value) => {
      if (!value || typeof value !== 'object') {
        return 'Bundle ist ungültig.';
      }

      const maybe = value as { script?: string; messages?: unknown[] };
      const hasScript = typeof maybe.script === 'string' && maybe.script.trim().length > 0;
      const hasMessages = Array.isArray(maybe.messages) && maybe.messages.length > 0;

      if (!hasScript && !hasMessages) {
        return 'Bitte mindestens ein Nachrichten-Skript oder strukturierte Nachrichten eintragen.';
      }

      return true;
    }),
});
