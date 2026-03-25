# Firestore V2 Schema and Rules

This document defines `MYT-12`: a clean `v2/*` Firestore namespace with explicit migration boundaries.

## Scope

- Flat namespace: `v2/*` (no season sub-tree).
- Includes:
  - user state,
  - submissions and moderation status,
  - scoring inputs,
  - leaderboard view.
- Legacy data is not part of the `v2` write model.

## Namespace Model

Collections (nested under top-level collection `v2`, app document `app`):

1. `v2/app/users/{uid}`
2. `v2/app/tasks/{taskId}`
3. `v2/app/submissions/{submissionId}`
4. `v2/app/scoreEvents/{eventId}`
5. `v2/app/leaderboard/{uid}`

System collection:

1. `v2/app/narrativeState/{bundleId}`

## Collection Contracts

`v2/app/users/{uid}`:

- Profile + continuity summary.
- `legacySummary` stores imported legacy continuity data (`totalPoints`, `rankSnapshot`, full `citizenship`, full `properties`) and is display/context only.
- Points in active ranking come from `v2/app/scoreEvents`, not legacy values.

`v2/app/tasks/{taskId}`:

- Task catalog (readable by authenticated users, writable by moderators/admins).

`v2/app/submissions/{submissionId}`:

- Backend-created text/photo submission keyed by mission + user idempotency.
- Canonical fields:
  - `ownerUid`,
  - `sourceId`,
  - `sourceType` (`text` or `photo`),
  - `payload` (text body or `gs://` storage path),
  - `status` (`pending`, `approved`, `rejected`),
  - `metadata.missionTitle`,
  - optional moderation fields such as `reviewedBy`, `reviewedAt`, `moderatorNote`, `earnedPoints`, `awarded`, `awardedAt`.
- Clients read their own submissions, but writes happen through backend endpoints and moderator/admin workflows only.

`v2/app/scoreEvents/{eventId}`:

- Immutable scoring ledger (append-only).
- Every points change is one event (`delta`, `reason`, `sourceType`, `sourceId`).
- `eventId` is aligned with `idempotencyKey` to prevent duplicate scoring on retries.

`v2/app/leaderboard/{uid}`:

- Denormalized read model for ranking.
- Mirrored from `users.pointsCurrent`.
- Client read-only; updated by backend workflows.

`v2/app/narrativeState/{bundleId}`:

- Backend-managed narrative release + update state (single source for idempotency and app invalidation).
- Fields:
  - `bundleId`,
  - `lastEventType` (`release` or `content_update`),
  - `releaseAt`,
  - `releasedAt`,
  - `pushState`,
  - `pushSentAt`,
  - `lastReleaseError`,
  - `updatedAt`.
- Clients read the latest updated doc (authenticated) and refetch feed when it changes.
- Client writes are denied.

## Why Score Events Are Required

`scoreEvents` are the authoritative scoring input and solve four problems:

1. Idempotency: retries do not double-award points.
2. Auditability: every points change is traceable.
3. Reversibility: corrections are compensating events (`delta < 0`), not history edits.
4. Rebuildability: leaderboard/user point totals can be recomputed from ledger history.

## Migration Boundary

- Legacy collections remain outside `v2`.
- New app writes only in `v2`.
- Legacy import writes only `legacySummary` context for returning users.
- Legacy points never directly affect active `v2` ranking totals.

## Security Rules Policy

Implemented in:

- `mytopia-functions/firestore.rules`

Key policy:

1. Authenticated users can only write:
   - their own `v2/app/users/{uid}` profile-safe fields.
2. Submission writes require moderator/admin claims because user submission creation goes through Cloud Functions.
3. `v2/app/scoreEvents` are immutable after creation.
4. `v2/app/leaderboard` is client read-only.
5. Non-`v2` access is denied by default in this rules baseline.

## Indexes

Implemented in:

- `mytopia-functions/firestore.indexes.json`

Includes indexes for:

1. `submissions` by owner + time.
2. `submissions` by status + time.
3. `submissions` by source mission + status + time.
4. `scoreEvents` by user + time.
5. `leaderboard` by points + update time.

## Deployment Note for Shared Firebase Project

Because old and new apps share the same Firebase project today:

1. Do not deploy `v2`-only rules to production until legacy rules are merged, or old-app access can break.
2. Safest rollout:
   - test these rules in emulator/staging,
   - merge with current legacy paths,
   - deploy combined rules.
