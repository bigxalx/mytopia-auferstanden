# Mytopia Mobile App

Expo Router app for the Mytopia participatory theatre experience.

## What It Does

- Email/password Firebase authentication with verified-email gating
- Narrative feed and actor-channel threads backed by Firebase/Sanity APIs
- Mission flows for quiz, GPS, text, and photo submissions
- Map, profile, points, achievements, and mission history screens
- FCM topic subscription and Expo Updates channel switching
- Local Fastlane lanes for native beta releases

## Setup

Install dependencies from the repository root:

```bash
bun install
```

Create local env:

```bash
cp .env.example .env.local
```

Fill `.env.local` with your own Firebase, Sanity, API, Expo/EAS, and native
release values. Production updates and store releases require the production
identity values documented in `.env.example`.

Place native Firebase config files in ignored paths:

```text
secrets/firebase/google-services.json
secrets/firebase/GoogleService-Info.plist
```

## Run

```bash
bun run start
```

This starts Expo with the development client. Rebuild the native dev client
after changing native dependencies or native Firebase config:

```bash
bunx expo prebuild --platform ios --clean --no-install
bun run ios
bunx expo prebuild --platform android --clean --no-install
bun run android
```

## OTA Updates

Production OTA updates are local-only by default. Before publishing, verify
that the resolved Expo config still targets your production app:

```bash
bun run release:preflight
```

Publish a production JS-only update:

```bash
bun run update:js:production -- "Describe the update"
```

Publish to the dev update channel:

```bash
bun run update:js:dev -- "Describe the dev update"
```

The update script loads `.env` first and `.env.local` second, so local
production values override public placeholders.
Publishing an OTA update automatically increments `expo.extra.otaVersion` in
`app.json` before the iOS and Android updates are uploaded. Native release lanes
reset that value, so the counter is scoped to the current `expo.version`.

## Native Releases

Fastlane release lanes also load `.env` and `.env.local`. Keep signing files and
credentials in ignored `secrets/` paths or env vars.

```bash
bun run release:bootstrap
bun run release:ios-beta
bun run release:android-beta
bun run release
```

The release lanes keep `expo.version`, `ios.buildNumber`, and
`android.versionCode` in `app.json` because those values are intentionally
mutated during native release preparation.

For iOS capability changes such as Associated Domains, use either
`IOS_SIGNING_STYLE=automatic` with Apple credentials that can refresh App Store
profiles, or regenerate the manual App Store provisioning profile and set
`IOS_PROVISIONING_PROFILE_NAME` to that profile name.

## Verification

```bash
bun run lint
bun run tsc --noEmit
```
