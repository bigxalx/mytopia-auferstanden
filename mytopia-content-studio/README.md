# Mytopia Content Studio

Sanity Studio package for narrative feed authoring.

Release/debug runbook:
- `../docs/narrative-feed-ops.md`

## Content Model

1. `narrativeActor`
   - `name`, `avatar`, `role`
2. `narrativeBundle`
   - Primary writing flow: `script` (+ optional `scriptActor`)
   - Scheduling + push copy: `releaseAt`, `pushTitle`, `pushBody`
   - Optional advanced mode: `messages` (structured objects)
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
