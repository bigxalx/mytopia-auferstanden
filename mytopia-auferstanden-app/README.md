# Mytopia App (Phase 1 Baseline)

Expo Router app for the Mytopia Phase 1 MVP.

## Architecture Baseline

`MYT-8` establishes a feature-oriented baseline replacing starter scaffolding.

### Route structure

- `app/index.tsx`
  - auth gate that redirects to `/(auth)/sign-in` or `/(tabs)/feed`
- `app/(auth)/sign-in.tsx`
  - sign-in screen (currently local session mock)
- `app/(tabs)/feed.tsx`
- `app/(tabs)/tasks.tsx`
- `app/(tabs)/map.tsx`
- `app/(tabs)/profile.tsx`
- `app/tasks/[taskId].tsx`
  - stack route for task details

### Feature modules

- `src/features/auth`
- `src/features/feed`
- `src/features/tasks`
- `src/features/map`
- `src/features/profile`

### Shared state

- `src/core/session/SessionContext.tsx`
  - app-wide session provider/hook
  - Firebase auth state listener with verified-email session gating

### Environment conventions

- `src/config/env.ts`
  - canonical environment access point
  - reads `EXPO_PUBLIC_*` values

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Fill values as they become available.
3. Configure feed + push client env vars:
   - `EXPO_PUBLIC_FEED_API_BASE_URL` (for example: `https://europe-west1-<project-id>.cloudfunctions.net/narrativeApi/`)
   - `EXPO_PUBLIC_NARRATIVE_TOPIC` (default: `narrative-global-v1`)
4. Place Firebase native config files in `secrets/firebase/` (ignored by git):
   - `secrets/firebase/google-services.json`
   - `secrets/firebase/GoogleService-Info.plist`
5. In Firebase Console, enable Authentication -> Sign-in method -> Email/Password.
6. This app enforces email verification before granting access to authenticated routes.
7. iOS uses static frameworks via `expo-build-properties` to satisfy Firebase CocoaPods integration.

```bash
cp .env.example .env
```

The Expo config reads these paths from:

- `ANDROID_GOOGLE_SERVICES_FILE`
- `IOS_GOOGLE_SERVICES_FILE`

## MYT-13 Narrative Feed + Push

Baseline architecture implemented for `MYT-13`:

1. Content source is Sanity (`narrativeBundle`, `narrativeActor`).
2. App reads feed via authenticated Firebase proxy API (`GET /feed`).
3. App listens to Firestore narrative state collection `v2/app/narrativeState/*` and refetches on newest update changes.
4. App also refetches on feed focus and app foreground resume.
5. After verified session hydration, app subscribes device to FCM topic (`EXPO_PUBLIC_NARRATIVE_TOPIC`).

Operational and release debugging runbook:
- `../docs/narrative-feed-ops.md`

### Playback behavior

Messages in each released bundle are revealed with client-side timing:

- text delay: `clamp(textLength * 45ms, 1500ms, 12000ms)`
- attachment-only delay: `3500ms`

### Attachment support

- `imageAttachment` -> inline image
- `audioAttachment` -> inline play/pause
- `videoAttachment` -> inline video player
- `missionAttachment` -> deep-link to `/tasks/[taskId]`

## Run

```bash
bun install
bun run start
```

`bun run start` uses `expo start --dev-client` (required for React Native Firebase).

If you changed native dependencies (for example added Firebase Messaging), rebuild dev clients:

```bash
bunx expo prebuild --platform ios --clean --no-install
bun run ios
bunx expo prebuild --platform android --clean --no-install
bun run android
```

## Recommended Dev Workflow

1. First install/update native build after native config changes:
   - `bunx expo prebuild --platform android --clean --no-install`
   - `bun run android`
   - Same idea for iOS with `--platform ios` and `bun run ios`.
2. For normal JS iteration after the app is installed:
   - `bun run start`
   - Open the already-installed development build on device/emulator.

If you see `No Firebase App '[DEFAULT]' has been created`, your installed native build is stale and needs reinstall via `bun run android` or `bun run ios`.
If you see `[firestore/permission-denied]` during session hydration, deploy the latest Firestore rules before retesting:

```bash
firebase deploy --only firestore:rules --project mytopia-6c440 --config firebase/firebase.json
```

## Local Toolchain Notes

Android local prerequisites (per developer machine):

1. Install JDK 17 and Android Studio SDK.
2. Configure shell env vars (`~/.zshrc`):
   - `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
   - `export ANDROID_HOME=$HOME/Library/Android/sdk`
   - `export ANDROID_SDK_ROOT=$ANDROID_HOME`
   - `export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator`
3. If Gradle reports `SDK location not found`, create local-only file:
   - `android/local.properties` with:
   - `sdk.dir=/Users/<your-user>/Library/Android/sdk`

Notes:

- `android/local.properties` is machine-local and should not be committed.
- `bun run android` should work without `prebuild` for JS-only changes once the native app is installed.

## Firestore V2 (MYT-12)

Firestore schema and security artifacts for the clean `v2/*` namespace:

- `firebase/firestore.rules`
- `firebase/firestore.indexes.json`
- `src/core/firestore/schema.ts`
- `../docs/firestore-v2-schema.md`

Deploy commands (Firebase CLI required):

```bash
cd firebase
firebase deploy --project mytopia-6c440 --config firebase.json --only firestore
```

Important:

- This rules baseline intentionally isolates `v2`.
- Because old/new apps currently share a Firebase project, merge legacy rules before production deploy.

## Returning User Import (MYT-11)

- On first verified login, the app reads legacy `users/{uid}` data and imports:
  - `legacySummary.totalPoints` from `citizenship.mytopia.score`
  - `legacySummary.rankSnapshot` from legacy Cloud Function `getRanking`
  - `legacySummary.citizenship` from legacy `users/{uid}.citizenship`
  - `legacySummary.properties` from legacy `users/{uid}.properties`
  - `legacySummary.importedAt` as ISO timestamp
- Session hydration profile sync is race-safe:
  - create `v2/app/users/{uid}` when missing
  - merge non-destructive updates for existing profiles
- Imported summary is continuity-only and does not affect v2 season ranking.
- Dedicated route `/welcome-back` is shown once immediately after successful import.

## Debug Logs (Expo-Recommended Workflow)

Use these commands to capture reproducible logs I can analyze directly.

### Build/Repro Logs (includes pod/Gradle phases)

```bash
bun run ios:repro
bun run android:repro
```

Each command writes a timestamped file in `.logs/`.

### System Logs (Expo docs / React Native CLI)

```bash
bun run log:ios
bun run log:android
```

### Metro Logs

```bash
bun run log:metro
```

### Feed API Reachability Probe

```bash
bun run feed:probe
```

Expected result for a healthy endpoint is `HTTP 401` (reachable and auth-protected).

### Feed Loading Debug (In-App)

- In development builds, the feed now emits debug logs:
  - `[feed-debug] ...` from screen loading lifecycle
  - `[feed-client] ...` from API request lifecycle
- If loading is stuck, capture Metro logs and include these lines.

When reporting a bug, share:

1. Platform and device/emulator
2. Exact steps to reproduce
3. Expected vs actual behavior
4. Timestamp of failure
5. Relevant `.logs/*` file(s)
