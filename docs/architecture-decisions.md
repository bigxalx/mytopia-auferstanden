# Architecture Decisions

## Monorepo

- Bun workspaces manage the mobile app, Firebase Functions, Sanity Studio, and
  Next.js website.
- The root `dev` script uses Turbo to run interactive packages together.

## Mobile App

- Expo Router provides file-based navigation.
- Native Firebase modules are used for Auth, Firestore, Storage, Messaging, and
  Crashlytics, so the app expects a development build rather than Expo Go.
- Runtime configuration is centralized in `src/config/env.ts` and fed by
  `EXPO_PUBLIC_*` values plus Expo config `extra` fallbacks.
- Production app identity and OTA values are resolved in `app.config.ts` from
  ignored local env files.

## Backend

- Firebase Auth is the user identity provider.
- Firestore stores user state, channel threads, narrative release state,
  submissions, rewards, and moderation data.
- Firebase Functions expose authenticated APIs for feed access, mission data,
  submissions, moderation support, scheduled releases, and account deletion.
- Cloud Tasks schedules timed narrative releases.
- FCM topics deliver narrative push notifications.

## Content

- Sanity stores narrative actors, narrative bundles, missions, checkpoints,
  settings, and achievements.
- The mobile app reads content through authenticated Firebase Functions rather
  than directly from Sanity.

## Release Safety

- Production identifiers are not committed.
- Local production OTA updates must pass `mytopia-auferstanden-app` release
  preflight before publishing.
- Native release lanes read app identity and signing configuration from env at
  lane runtime.
