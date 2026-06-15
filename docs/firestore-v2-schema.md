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
2. `v2/app/liveSessions/{sessionId}`

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

`v2/app/liveSessions/{sessionId}`:

- Backend-managed live show session for Phase 2 interactions.
- The session gates live events so production users outside the current show do
  not receive theatre triggers.
- Current sessions use deterministic IDs:
  - `production-current`
  - `dev-current`
- The moderator UI treats each mode as a singleton live session. Normal show
  operation is driven by `liveShowWindows`; the backend lazily upserts this
  deterministic session during an active window. Manual start/end exists only in
  Advanced debug controls.
- Canonical fields:
  - `title`,
  - `mode` (`production` or `dev`),
  - `status` (`draft`, `active`, `paused`, `closed`),
  - `sessionSource` (`schedule` or `manual`),
  - `showWindowId`,
  - `startsAt`,
  - `endsAt`,
  - `venueName`,
  - `venueLatitude`,
  - `venueLongitude`,
  - `venueRadiusMeters`,
  - `joinTokenHash`,
  - `currentEventId`,
  - `createdAt`,
  - `updatedAt`.
- QR/session join is the authoritative gate. GPS plus time can auto-check-in a
  user only when permission, time window, and venue radius match.
- `startsAt`/`endsAt` are copied from the active show window for scheduled
  sessions, or set to a short debug duration for manual Advanced sessions.
- MVP venue defaults are Theater Altenburg Gera at `50.9871377`, `12.4374725`
  with a 50m radius.
- Client writes to session metadata are denied.

`v2/app/liveShowWindows/{windowId}`:

- Backend-managed showtime windows that define when the reusable QR can join the
  live session.
- Created and edited through the hidden website moderation dashboard.
- Canonical fields:
  - `title`,
  - `mode` (`production` or `dev`),
  - `status` (`scheduled` or `cancelled`),
  - `startsAt`,
  - `endsAt`,
  - `venueName`,
  - `venueLatitude`,
  - `venueLongitude`,
  - `venueRadiusMeters`,
  - `createdAt`,
  - `createdBy`,
  - `updatedAt`,
  - `updatedBy`,
  - `cancelledAt`,
  - `cancelledBy`.
- A scheduled window is active when server time is between `startsAt` and
  `endsAt`. Active windows take priority over leftover manual debug sessions.
- Client writes are denied.

`v2/app/liveSessions/{sessionId}/private/joinToken`:

- Backend-only private token document used by the admin page to redisplay the
  reusable QR code without storing the raw token in the public session document.
- Canonical fields:
  - `token`,
  - `tokenHash`,
  - `createdAt`,
  - `updatedAt`.
- The token is stable by default and is not rotated when sessions/windows open.
- Client reads and writes are denied.

`v2/app/liveSessions/{sessionId}/participants/{uid}`:

- Per-user session membership and connection state.
- Canonical fields:
  - `uid`,
  - `joinedAt`,
  - `joinMethod` (`qr`, `auto-gps-time`, `manual-admin`),
  - `lastSeenAt`,
  - `leftAt`,
  - `connectionState` (`connected`, `reconnecting`, `offline`),
  - `deviceLabel`,
  - `updatedAt`.
- Participants are scoped to one session. Joining a session is required before a
  user listens for or renders live events.
- Implementation should prefer Function-backed writes for joins, explicit leaves,
  and session/window cleanup so validation can check QR token, session status,
  and GPS/time constraints.

`v2/app/liveSessions/{sessionId}/events/{eventId}`:

- Backend-managed live event lifecycle for joined session participants.
- Initial supported event type is `terror_alert`.
- Canonical fields:
  - `type` (`terror_alert`),
  - `status` (`active`, `cleared`),
  - `source` (`admin`, `adaptor`),
  - `cueId`,
  - `payload.title`,
  - `payload.message`,
  - `payload.severity`,
  - `createdAt`,
  - `createdBy`,
  - `clearedAt`,
  - `clearedBy`,
  - `updatedAt`.
- Joined app clients listen to the current session state and render a global
  alarm takeover when the active event is `terror_alert`.
- Client writes are denied; admin/adaptor writes go through Firebase Functions.

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
5. Live sessions are read only for eligible signed-in users; live event writes
   are server-only.
6. Live session private token docs are denied to all clients.
7. Non-`v2` access is denied by default in this rules baseline.

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
