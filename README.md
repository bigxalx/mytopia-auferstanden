# Mytopia Auferstanden

Mytopia Auferstanden is a Bun monorepo for a participatory mobile theatre
experience. It combines an Expo/React Native app, Firebase Functions, a Sanity
content studio, and a small Next.js web companion site.

The project is published as a reference implementation. You need your own
Firebase, Sanity, Expo/EAS, app store, and signing configuration before running
production deployments.

## Packages

| Path | Purpose |
| --- | --- |
| `mytopia-auferstanden-app` | Expo Router mobile app for narrative feeds, missions, map interactions, profile state, push notifications, and OTA updates. |
| `mytopia-functions` | Firebase Functions API for authenticated feed access, mission submission, moderation support, account deletion, and scheduled narrative releases. |
| `mytopia-content-studio` | Sanity Studio schema and editor UI for narrative bundles, actors, missions, checkpoints, and achievements. |
| `mytopia-website` | Next.js support/marketing/moderation/account-deletion site. |

## Requirements

- Bun 1.3+
- Node.js 22 for Firebase Functions
- Expo development build tooling for the mobile app
- Firebase project with Authentication, Firestore, Storage, Cloud Functions,
  FCM, and Cloud Tasks as needed
- Sanity project for content authoring
- Optional native release tooling: Ruby/Bundler, Fastlane, Xcode, Android Studio

Use Bun for all package work in this repository. Do not use npm, yarn, pnpm, or
npx.

## Setup

Install dependencies from the repository root:

```bash
bun install
```

Create local environment files from the examples:

```bash
cp mytopia-auferstanden-app/.env.example mytopia-auferstanden-app/.env.local
cp mytopia-functions/.env.example mytopia-functions/.env
cp mytopia-content-studio/.env.example mytopia-content-studio/.env
cp mytopia-website/.env.example mytopia-website/.env.local
```

Fill those files with values from your own infrastructure. The committed
examples contain only placeholders. Local `.env` files, Firebase native config,
service account files, app store keys, keystores, and provisioning profiles are
ignored by git.

## Development

Run the app and studio together:

```bash
bun run dev
```

Run packages individually:

```bash
bun run dev:app
bun run dev:studio
bun run --cwd mytopia-functions build
bun run --cwd mytopia-website dev
```

The Expo app uses a development client because it depends on native Firebase
modules. After native dependency or native config changes, rebuild the dev
client with Expo prebuild/run commands from `mytopia-auferstanden-app`.

## Configuration Model

Public runtime values use `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` names. They are
bundled into the app or website, so they are not secrets, but production values
should still live in ignored local env files instead of committed source.

Private release values include Expo project IDs, EAS update URLs, bundle IDs,
Apple team IDs, signing credentials, service account files, and app store keys.
Keep those in ignored local files or secret managers.

Before publishing a production OTA update from the mobile package, run:

```bash
bun run --cwd mytopia-auferstanden-app release:preflight
```

If the preflight passes, publish a JS-only update locally:

```bash
bun run update:js:production -- "Describe the update"
```

The repository intentionally does not ship an active GitHub Actions production
deployment workflow. Production releases are local by default.

## Verification

Run the full check set before publishing changes:

```bash
bun run --cwd mytopia-auferstanden-app lint
bun run --cwd mytopia-auferstanden-app tsc --noEmit
bun run --cwd mytopia-functions build
bun run --cwd mytopia-website build
bun run build
```

## License

Copyright 2026 [Armin Luschin](https://arminluschin.com).

Source code is licensed under the Apache License, Version 2.0. See
[`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

The license does not grant trademark rights or rights to project names, logos,
story material, theatre branding, production material, or other non-code assets
unless a file explicitly says otherwise.
