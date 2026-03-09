# Mobile Distribution Playbook

This is the shortest practical path to ship current builds to testers while keeping production stable.

## Recommended Now

1. Keep one app build line.
2. Use mode switching + Firebase custom claim `dev` for tester behavior.
3. Use local Fastlane lanes for beta uploads.
4. Keep production default; testers explicitly switch to `Dev` in-app.

## Fastlane Setup

### 1) Local files

Keep all release credentials local and ignored by git:

1. Firebase native config:
   - `mytopia-auferstanden-app/secrets/firebase/google-services.json`
   - `mytopia-auferstanden-app/secrets/firebase/GoogleService-Info.plist`
2. Android upload credentials:
   - `mytopia-auferstanden-app/secrets/credentials/android/keystore.jks`
   - `mytopia-auferstanden-app/secrets/credentials/android/credentials.json`
3. App Store Connect API key:
   - `mytopia-auferstanden-app/secrets/fastlane/appstore/AuthKey_<KEY_ID>.p8`
4. Google Play service account JSON:
   - `mytopia-auferstanden-app/secrets/fastlane/play/play-console-service-account.json`

### 2) Shell env

```bash
export APP_STORE_CONNECT_KEY_ID=<key-id>
export APP_STORE_CONNECT_ISSUER_ID=<issuer-id>
```

Fastlane is expected to run with Homebrew Ruby (`/opt/homebrew/opt/ruby/bin`).
The repo wrapper scripts prefer that automatically and fail fast if only the macOS system Bundler 1.x is available.

Use these only if you keep files outside the standard ignored paths:

- `APP_STORE_CONNECT_KEY_PATH`
- `PLAY_JSON_KEY_PATH`
- `ANDROID_KEYSTORE_PATH`
- `ANDROID_CREDENTIALS_JSON_PATH`
- `IOS_GOOGLE_SERVICES_FILE`
- `ANDROID_GOOGLE_SERVICES_FILE`

### 3) Bootstrap

```bash
bun run release:bootstrap
bun run release:lanes
```

## Native Releases (Fastlane)

From the repo root:

```bash
bun run release:ios-beta
bun run release:android-beta
bun run release:beta
```

From `mytopia-auferstanden-app/`:

```bash
./scripts/run-bundle.sh exec fastlane ios_beta
./scripts/run-bundle.sh exec fastlane android_beta
./scripts/run-bundle.sh exec fastlane beta_all
```

Lane behavior:

1. Increment the target platform build counter in `app.json`.
2. Run `expo prebuild --platform <platform> --clean`.
3. Build the native artifact locally.
4. Upload to TestFlight or Play Internal Testing.

Important:

1. The next native builds must be shipped once to seed `expo-updates` into the installed app.
2. After testers install that native build, later JS-only changes can ship over the air.

## JS Updates (Expo)

Channel mapping:

1. `production` app mode -> Expo channel `production`
2. `dev` app mode -> Expo channel `dev`

Publish JS-only updates from the repo root:

```bash
bun run update:js:production -- "Fix production feed copy"
bun run update:js:dev -- "Test new narration timing"
```

Or from `mytopia-auferstanden-app/`:

```bash
./scripts/run-eas-update.sh production "Fix production feed copy"
./scripts/run-eas-update.sh dev "Test new narration timing"
```

Operational rules:

1. `expo.version` is now the runtime boundary because `runtimeVersion` follows `appVersion`.
2. Native changes require manually bumping `expo.version`, then shipping a new binary through Fastlane.
3. JS-only changes do not bump `expo.version`; publish them with Expo Update instead.
4. The app auto-checks the selected channel on launch/mode change and the profile screen can manually check/apply a downloaded update.

## Tester Rollout

### 1) Prepare testers

1. Add Firebase custom claim `dev: true` for each tester UID.
2. Ask testers to sign out/in once (claim refresh).
3. Confirm they can switch to `Dev` in profile.

### 2) iOS: TestFlight

1. Run `bun run release:ios-beta`.
2. Open App Store Connect -> TestFlight.
3. Add internal testers first.
4. Add external group when internal smoke test passes.

### 3) Android: Play Internal Testing

1. Run `bun run release:android-beta`.
2. Open Play Console -> Testing -> Internal testing.
3. Add tester emails or group.
4. Roll out the release to internal track.

### 4) Tester validation script

1. Install build from TestFlight/Play internal.
2. Login with tester account (`dev: true`).
3. Switch profile mode to `Dev`.
4. Open Profile and confirm the requested JS channel shows `dev`.
5. Publish a JS update to channel `dev` and apply it from the profile screen.
6. Publish a bundle in Sanity `development` dataset.
7. Confirm push + feed update.
8. Switch back to Production and verify production feed remains clean.

## Notes

1. `expo.version` remains manual and now controls OTA compatibility boundaries.
2. `ios.buildNumber` and `android.versionCode` are auto-incremented by the Fastlane lanes.
3. Android Studio is still useful for local inspection, but Fastlane can build the signed AAB directly from the terminal.
4. If you open Android Studio manually, open it from a terminal session so Gradle inherits your `node` path.
