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

- `POST /sanity/webhook`
  - Verifies Sanity webhook signatures
  - Schedules or replaces Cloud Tasks for timed narrative releases
  - Propagates narrative actor profile changes into existing actor channels
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

## Sanity Webhook

Configure the Sanity webhook to send create, update, and delete events for all
document types that affect released app content:

```groq
_type in ["narrativeBundle", "mission", "narrativeActor"]
```

`narrativeActor` must be included so sender name, avatar, role, and name color
changes are propagated into existing Firestore actor channel documents.
The webhook payload must include at least `_id` and `_type`.

## Scripts

```bash
bun run build
bun run cleanup-launch-artifacts
bun run cleanup-launch-artifacts -- --email armin.luschin@gmail.com
bun run cleanup-launch-artifacts -- --apply
bun run cleanup-launch-artifacts -- --email armin.luschin@gmail.com --apply
bun run cleanup-launch-artifacts -- --restore ../tmp/cleanup-launch-artifacts/<backup>/manifest.json
bun run deploy
bun run set-claim -- <email> <claim>
bun run repair-channel-threads -- --uid <uid> --mode production
bun run webhook:probe -- --type narrativeActor
```

`cleanup-launch-artifacts` is dry-run by default. It detects production users
with channel or submission records pointing at deleted Sanity actors/missions,
then reports the launch data it would reset. `--apply` deletes only that
production app state while keeping Firebase Auth accounts. Apply first writes a
local backup under `tmp/cleanup-launch-artifacts/`; `--restore` replays one of
those backup manifests if the cleanup needs to be rolled back. Restore writes
the backed-up Firestore documents and Storage files back to their original
paths, so use the matching manifest from the apply run you want to undo. Use
`--email` or `--uid` to dry-run or apply the cleanup for one affected user only.

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
