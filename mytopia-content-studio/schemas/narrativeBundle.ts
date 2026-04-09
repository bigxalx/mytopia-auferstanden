import { defineArrayMember, defineField, defineType } from 'sanity';
import { CommentIcon } from '@sanity/icons';
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
  preview: {
    select: {
      title: 'caption',
      media: 'asset',
    },
    prepare(selection) {
      return {
        title: selection.title || 'Bild ohne Unterschrift',
        media: selection.media,
      };
    },
  },
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
  preview: {
    select: {
      title: 'title',
    },
    prepare(selection) {
      return {
        title: selection.title || 'Audio-Datei',
        subtitle: '🎙️ Sprachnachricht',
      };
    },
  },
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
  preview: {
    select: {
      title: 'title',
    },
    prepare(selection) {
      return {
        title: selection.title || 'Video-Datei',
        subtitle: '🎥 Video',
      };
    },
  },
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
  preview: {
    select: {
      title: 'title',
      missionTitle: 'mission.title',
      missionImage: 'mission.image',
      excerpt: 'excerpt',
    },
    prepare(selection) {
      return {
        title: selection.title || selection.missionTitle || 'Unbenannte Mission',
        subtitle: selection.excerpt || 'Missions-Anhang',
        media: selection.missionImage,
      };
    },
  },
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
      actorAvatar: 'actor.avatar',
      text: 'text',
      attachmentType: 'attachment.0._type',
    },
    prepare(selection) {
      const { actorName, actorAvatar, text, attachmentType } = selection;
      const actor = actorName || 'Unbekannter Absender';

      const emojiMap: Record<string, string> = {
        imageAttachment: '📸',
        audioAttachment: '🎙️',
        videoAttachment: '🎥',
        missionAttachment: '🚩',
      };

      const emoji = attachmentType ? (emojiMap[attachmentType] || '📎') : '';
      const content = text || (attachmentType ? 'Anhang' : 'Leere Nachricht');
      const subtitle = emoji ? `${emoji} ${content}` : content;

      return {
        title: actor,
        subtitle,
        media: actorAvatar,
      };
    },
  },
});

export const narrativeBundle = defineType({
  name: 'narrativeBundle',
  title: 'Story',
  type: 'document',
  icon: CommentIcon,
  fields: [
    defineField({
      name: 'internalTitle',
      title: 'Interner Titel',
      type: 'string',
      description: 'Z.B. "Kapitel 1 - Einführung". Erscheint nur hier im CMS zur Übersicht.',
    }),
    defineField({
      name: 'scriptActor',
      title: 'Standard-Absender',
      type: 'reference',
      to: [{ type: 'narrativeActor' }],
      description: 'Wähle den Absender, der für neue Nachrichten im Chat-Editor verwendet wird.',
      validation: (rule) => rule.required(),
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
      name: 'publishMode',
      title: 'Veröffentlichungs-Modus',
      type: 'string',
      options: {
        list: [
          { title: '📅 Geplant', value: 'scheduled' },
          { title: '🚀 Sofort senden', value: 'instant' },
        ],
        layout: 'radio',
      },
      initialValue: 'scheduled',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'releaseAt',
      title: 'Veröffentlichung',
      type: 'datetime',
      description: 'Wann soll die Story im Feed erscheinen?',
      hidden: ({ document }) => document?.publishMode !== 'scheduled',
      initialValue: () => new Date().toISOString(),
      validation: (rule) =>
        rule.custom((value, context) => {
          if (context.document?.publishMode === 'scheduled' && !value) {
            return 'Ein Datum ist erforderlich für geplante Nachrichten.';
          }
          return true;
        }),
    }),
    defineField({
      name: 'pushTitle',
      title: 'Push-Titel',
      type: 'string',
      description: 'Optional: Leer = "Neue Nachricht von [Name]". Empfohlen: < 40 Zeichen.',
      validation: (rule) => rule.max(60).warning('Push-Titel über 40 Zeichen werden auf vielen Geräten abgeschnitten.'),
    }),
    defineField({
      name: 'pushBody',
      title: 'Push-Text',
      type: 'text',
      rows: 2,
      description: 'Optional: Leer = Erster Text der Nachricht. Empfohlen: < 150 Zeichen.',
      validation: (rule) => rule.max(200).warning('Push-Texte über 150 Zeichen werden auf vielen Geräten abgeschnitten.'),
    }),
    defineField({
      name: 'script',
      title: 'Nachrichten-Skript (LEGACY / ALT)',
      type: 'text',
      rows: 10,
      description:
        '⚠️ ALT: Nutze dieses Feld nur, wenn du den neuen Chat-Editor nicht verwenden möchtest. Das neue Feld (Nachrichten & Anhänge) überschreibt dieses Skript komplett.',
      hidden: ({ value }) => !value,
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
      internalTitle: 'internalTitle',
      actorName: 'scriptActor.name',
      actorAvatar: 'scriptActor.avatar',
      script: 'script',
      firstMessageText: 'messages.0.text',
      firstMessageAttachment: 'messages.0.attachment.0._type',
      releaseAt: 'releaseAt',
      publishMode: 'publishMode',
      updatedAt: '_updatedAt',
    },
    prepare(selection) {
      const { internalTitle, actorName, actorAvatar, script, firstMessageText, firstMessageAttachment, releaseAt, publishMode, updatedAt } = selection;

      const emojiMap: Record<string, string> = {
        imageAttachment: '📸',
        audioAttachment: '🎙️',
        videoAttachment: '🎥',
        missionAttachment: '🚩',
      };

      let title = internalTitle || 'Narrative Bundle';
      if (!internalTitle) {
        if (firstMessageText) {
          const emoji = firstMessageAttachment ? (emojiMap[firstMessageAttachment] || '📎') : '';
          title = emoji ? `${emoji} ${firstMessageText}` : firstMessageText;
        } else if (firstMessageAttachment) {
          title = `${emojiMap[firstMessageAttachment] || '📎'} Anhang`;
        } else if (script) {
          title = script.split('\n').filter(Boolean)[0] || title;
        } else if (actorName) {
          title = `Story von ${actorName}`;
        }
      }

      const isInstant = publishMode === 'instant';
      const referenceDate = isInstant ? updatedAt : releaseAt;
      const isReleased = referenceDate && new Date(referenceDate) <= new Date();
      const dateStr = referenceDate ? new Date(referenceDate).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;

      let subtitle = 'Kein Release-Zeitpunkt';
      if (dateStr) {
        if (isInstant) {
          subtitle = `Sofort veröffentlicht: ${dateStr}`;
        } else {
          subtitle = isReleased ? `Veröffentlicht: ${dateStr}` : `Geplant: ${dateStr}`;
        }
      }

      return {
        title,
        subtitle,
        media: actorAvatar,
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
