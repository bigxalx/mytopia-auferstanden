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
3. Place Firebase native config files in `secrets/firebase/` (ignored by git):
   - `secrets/firebase/google-services.json`
   - `secrets/firebase/GoogleService-Info.plist`
4. In Firebase Console, enable Authentication -> Sign-in method -> Email/Password.
5. This app enforces email verification before granting access to authenticated routes.
6. iOS uses static frameworks via `expo-build-properties` to satisfy Firebase CocoaPods integration.

```bash
cp .env.example .env
```

The Expo config reads these paths from:

- `ANDROID_GOOGLE_SERVICES_FILE`
- `IOS_GOOGLE_SERVICES_FILE`

## Run

```bash
bun install
bun run start
```

`bun run start` uses `expo start --dev-client` (required for React Native Firebase).

## Recommended Dev Workflow

1. First install/update native build after native config changes:
   - `bunx expo prebuild --platform android --clean --no-install`
   - `bun run android`
   - Same idea for iOS with `--platform ios` and `bun run ios`.
2. For normal JS iteration after the app is installed:
   - `bun run start`
   - Open the already-installed development build on device/emulator.

If you see `No Firebase App '[DEFAULT]' has been created`, your installed native build is stale and needs reinstall via `bun run android` or `bun run ios`.

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

When reporting a bug, share:

1. Platform and device/emulator
2. Exact steps to reproduce
3. Expected vs actual behavior
4. Timestamp of failure
5. Relevant `.logs/*` file(s)
