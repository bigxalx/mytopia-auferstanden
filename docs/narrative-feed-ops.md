# Narrative Feed + Push Operations (MYT-13)

This is the operational runbook for the narrative release pipeline.

## Architecture (Production)

1. Editors publish `narrativeBundle` documents in Sanity (`releaseAt` required).
2. Sanity webhook calls Firebase Function: `POST /sanity/webhook/bundle-upsert`.
3. Function schedules Cloud Task for `releaseAt` (or updates signal for post-release edits).
4. Cloud Task calls `POST /internal/release-bundle`.
5. Release handler writes Firestore signal doc and sends one FCM topic push.
6. App listens to `v2/app/narrativeState/*` and refetches `GET /feed`.

Sanity remains the source of truth for narrative content.

## Required Configuration

### Sanity Studio

- Schema deployed with:
  - `narrativeActor`
  - `narrativeBundle`
- Webhook target:
  - `https://europe-west1-<project-id>.cloudfunctions.net/narrativeApi/sanity/webhook/bundle-upsert`
- Webhook secret must match function runtime secret/env.

Recommended webhook settings:

- Filter: `_type == "narrativeBundle"`
- Projection: leave empty (backend fetches full doc)

### Firebase / GCP

- Functions deployed from `mytopia-functions`.
- Cloud Tasks queue exists in configured region.
- Firestore rules deployed with read access to `v2/app/narrativeState/*` for authenticated users.
- FCM configured for iOS + Android native apps.

### App

- `EXPO_PUBLIC_FEED_API_BASE_URL` set to the deployed `narrativeApi` base URL.
- `EXPO_PUBLIC_NARRATIVE_TOPIC` set (or default used).
- Native app rebuilt after adding/updating RN Firebase native deps.

## Local Development Workflow

### Start services

1. App (dev client):

```bash
bun run dev:app
```

2. Studio:

```bash
bun run dev:studio
```

3. Functions build check:

```bash
bun run --cwd mytopia-functions build
```

### Verify endpoint reachability

```bash
bun run --cwd mytopia-auferstanden-app feed:probe
```

Expected: `HTTP 401` (reachable + auth-protected).

### Verify webhook signature wiring

```bash
bun run --cwd mytopia-functions webhook:probe
```

Expected: `HTTP 200` and `Signature accepted by function runtime.`

## Smoke Test (Release Pipeline)

1. In Studio, publish a `narrativeBundle` with `releaseAt` 2-5 minutes in the future.
2. Confirm webhook delivery is `200` in Sanity webhook logs.
3. Confirm Cloud Task exists (or executes at release time).
4. At release time, verify:
   - Firestore doc: `v2/app/narrativeState/{bundleId}` updated (`lastEventType=release`, `pushState=sent` or `failed`)
   - Push appears on subscribed device.
   - Feed refresh shows new messages.
5. Edit the already released bundle and publish again.
6. Verify:
   - No second push.
   - Firestore state gets `lastEventType=content_update`.
   - App refresh/listener shows updated content.

## Troubleshooting

### Webhook returns 401 `Invalid Sanity webhook signature`

Checks:

1. Secret equality in three places:
   - Sanity webhook secret
   - `SANITY_WEBHOOK_SECRET` in function runtime
   - local `.env` (for probe)
2. Ensure webhook hits the correct URL path (`/sanity/webhook/bundle-upsert`).

### Feed endpoint returns 200 with empty `bundles`

Checks:

1. `releaseAt` exists and is <= current UTC time.
2. Bundle is published (not draft).
3. Query filter is deployed from latest functions build.

### App stuck on loading feed

Checks:

1. Capture Metro + app logs using app README commands.
2. Confirm `EXPO_PUBLIC_FEED_API_BASE_URL` is set in app env.
3. Confirm authenticated user exists and API returns valid bundle payload.
4. Confirm Firestore listener path `v2/app/narrativeState` is readable by rules.

### Push not shown on device

Checks:

1. iOS/Android notification permission granted.
2. App subscribed to topic after verified login.
3. Function logs show `push_sent` and no FCM error.
4. Device-level notification settings enabled.

## Ship Checklist

1. `bun run build` succeeds at repo root.
2. `bun run --cwd mytopia-auferstanden-app lint` succeeds.
3. Functions deployed and logs clean for one test release.
4. Sanity webhook delivery verified.
5. One end-to-end release smoke test passed on real device.
6. Linear issue updated with evidence (bundle id, release timestamp, push result).
