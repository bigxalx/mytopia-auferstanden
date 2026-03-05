# Mobile Distribution Playbook

This is the shortest practical path to ship current builds to testers while keeping production stable.

## Recommended Now

1. Keep one app build line.
2. Use mode switching + Firebase custom claim `dev` for tester behavior.
3. Keep production default; testers explicitly switch to `Dev` in-app.

## Tester Rollout (Current Setup)

### 1) Prepare testers

1. Add Firebase custom claim `dev: true` for each tester UID.
2. Ask testers to sign out/in once (claim refresh).
3. Confirm they can switch to `Dev` in profile.

### 2) iOS: TestFlight

Use TestFlight for iOS instead of ad-hoc links.

```bash
cd mytopia-auferstanden-app
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

After submit:

1. Open App Store Connect -> TestFlight.
2. Add internal testers first.
3. Add external group when internal smoke test passes.

### 3) Android: Play Internal Testing

```bash
cd mytopia-auferstanden-app
eas build --platform android --profile production
eas submit --platform android --profile production --latest
```

After submit:

1. Open Play Console -> Testing -> Internal testing.
2. Add tester emails or group.
3. Roll out the release to internal track.

### 4) Tester validation script

1. Install build from TestFlight/Play internal.
2. Login with tester account (`dev: true`).
3. Switch profile mode to `Dev`.
4. Publish a bundle in Sanity `development` dataset.
5. Confirm push + feed update.
6. Switch back to Production and verify production feed remains clean.

## About EAS `preview` / internal profile

`preview` in `eas.json` is useful for rapid internal builds.

- Android: usually straightforward for direct installs.
- iOS: ad-hoc distribution requires registered devices and is less scalable than TestFlight.

For editor/tester rollout, TestFlight is usually simpler.

## Fastlane (Optional Next Step)

You can keep using only EAS for now. Add Fastlane when you need repeatable release automation.

Good use-cases:

1. Consistent versioning/changelog flows.
2. One-command beta uploads.
3. Store metadata/screenshots automation.

Minimal shape:

1. Add `fastlane/Fastfile` in `mytopia-auferstanden-app`.
2. Create lanes:
   - `ios_beta`: trigger EAS iOS build + upload to TestFlight.
   - `android_beta`: trigger EAS Android build + upload to Play internal.
3. Keep signing/secrets in EAS + App Store Connect + Play Console, and call them from lanes.

If you want, next pass can add a minimal `fastlane` setup with two lanes only (`ios_beta`, `android_beta`) and no extra complexity.
