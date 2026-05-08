# Mytopia Firebase Functions

Firebase Functions package for narrative feed APIs, mission APIs, moderation
support, scheduled releases, and account deletion.

## Setup

```bash
cp .env.example .env
bun install
```

Set `MYTOPIA_FIREBASE_PROJECT_ID` and the Sanity, Cloud Tasks, FCM, and service account
values in `.env`. Use credentials from your own Firebase and Sanity projects.

## Endpoints

- `POST /sanity/webhook/bundle-upsert`
  - Verifies Sanity webhook signatures
  - Schedules or replaces Cloud Tasks for timed narrative releases
- `POST /internal/release-bundle`
  - Cloud Tasks-only release endpoint
  - Publishes released narrative state and sends one FCM topic push
- `GET /feed`
  - Requires a Firebase ID token
  - Returns released narrative bundles
- Mission and map routes
  - Serve mission settings, submission, and moderation workflows
- `POST /account/delete`
  - Requires a Firebase ID token
  - Deletes the current user and related app data

## Scripts

```bash
bun run build
bun run deploy
bun run set-claim -- <email> <claim>
bun run repair-channel-threads -- --uid <uid> --mode production
```

Deploy reads `MYTOPIA_FIREBASE_PROJECT_ID`, `GCLOUD_PROJECT`, or `GCP_PROJECT`. No
production project ID is hardcoded in the public source.
`bun run deploy` loads `.env` and `.env.local` automatically, then deploys the
full Firebase config in `firebase.json`: functions, Firestore rules/indexes,
and Storage rules.
Firebase deploy flags are passed through, for example:

```bash
bun run deploy -- --only functions
bun run deploy -- --only firestore:rules,firestore:indexes,storage
```

## Verification

```bash
bun run build
```
