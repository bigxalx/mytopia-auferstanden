# Mytopia Narrative Functions

Firebase Functions package for MYT-13 narrative release and feed proxy.

Full operational runbook:
- `../docs/narrative-feed-ops.md`

## Endpoints

Primary deployed endpoint is `narrativeApi` with routes:

1. `POST /sanity/webhook/bundle-upsert`
   - verifies Sanity webhook signature
   - schedules/replaces Cloud Task for bundle release (`releaseAt`)
   - optional query `mode=dev` for development dataset handling
   - updates Firestore narrative state for post-release content updates
2. `POST /internal/release-bundle`
   - Cloud Tasks-only endpoint (OIDC + queue header verification)
   - optional payload `mode: "dev"`
   - idempotent release gate (`releasedAt`)
   - sends one FCM topic push
   - updates Firestore narrative state (`v2/app/narrativeState/{bundleId}` or `v2/app/narrativeStateDev/{bundleId}`)
3. `GET /feed`
   - validates Firebase ID token
   - optional query `mode=dev` (requires Firebase custom claim `dev: true`)
   - returns released bundles from Sanity with cursor pagination

## Environment

Copy `.env.example` to `.env` for local development and set:

- `SANITY_PROJECT_ID`
- `SANITY_DATASET`
- `SANITY_DATASET_DEV` (required for `mode=dev`)
- `SANITY_API_TOKEN` (read-only token is sufficient)
- `SANITY_WEBHOOK_SECRET`
- `FCM_TOPIC_NARRATIVE`
- `FCM_TOPIC_NARRATIVE_DEV` (optional; falls back to `<FCM_TOPIC_NARRATIVE>-dev`)
- `CLOUD_TASKS_QUEUE`
- `CLOUD_TASKS_LOCATION`
- `RELEASE_FUNCTION_URL` (full route URL, for example `.../narrativeApi/internal/release-bundle`)
- `TASKS_SERVICE_ACCOUNT_EMAIL`

## Build and Deploy

```bash
bun install
bun run build
bun run deploy
```

Deploy uses `firebase.json` codebase `narrative`.

## Webhook Signature Probe

Use this to verify signature handling directly from your local env values:

```bash
bun run webhook:probe
```

Expected result:
- `HTTP 200` with `Signature accepted by function runtime.`
- If you get `401`, `SANITY_WEBHOOK_SECRET` is still mismatched in deployed runtime.

## Operational Notes

- Cloud Tasks queue must exist in `CLOUD_TASKS_LOCATION`.
- Queue example:

```bash
gcloud tasks queues create narrative-release-v1 --location=europe-west1
```

- Sanity webhook should point to `narrativeApi/sanity/webhook/bundle-upsert`.
- Development webhook can use the same path with query string `?mode=dev`.
- Authoring timezone policy is Europe/Berlin; Sanity stores UTC datetimes.
