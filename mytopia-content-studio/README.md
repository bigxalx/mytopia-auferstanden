# Mytopia Content Studio

Sanity Studio package for narrative feed authoring.

Release/debug runbook:
- `../docs/narrative-feed-ops.md`

## Content Model

1. `narrativeActor`
   - `name`, `avatar`, `role`
2. `narrativeBundle`
   - Seite 1 (Story): `script`, `scriptActor`, `releaseAt`
   - Seite 2 (Push): `pushTitle`, `pushBody`, optional `messages` override
3. `narrativeMessage` object
   - `messageId`, `actor`, `text`, `attachment`
4. Attachment polymorphic object (max 1 per message)
   - `imageAttachment`
   - `audioAttachment`
   - `videoAttachment`
   - `missionAttachment`

## Environment

Copy `.env.example` to `.env` and set:

- `SANITY_STUDIO_PROJECT_ID`
- `SANITY_STUDIO_DATASET`

## Run

```bash
bun install
bun run dev
```

## Editorial Shortcut (Simple Mode)

- Write in `Nachrichten-Skript`.
- One blank line = one new message bubble in the app.
- `Standard-Absender` is used for all script messages.
- Use `Nachrichten-Override` only when you need structured messages (for example attachments).
