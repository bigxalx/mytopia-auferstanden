# TestFlight Release Prep (2026-03-25)

This document summarizes the working-tree changes that were consolidated into the next native release after `8c3f5cf` in the main repository and `615118f` in `mytopia-website/`.

## Scope

This release bundles three threads of work that need native or backend rollout together:

- Crashlytics integration and user-controlled telemetry consent.
- Text/photo mission submission with moderator review and scoring.
- Narrative/feed refresh improvements plus repository/tooling cleanup.

## App Changes

- Added Firebase Crashlytics to the Expo app and wired runtime consent through [`firebase.json`](../mytopia-auferstanden-app/firebase.json) and [`privacyManager.ts`](../mytopia-auferstanden-app/src/core/firebase/privacyManager.ts).
- Added iOS and Android permissions for GPS missions and photo submissions in [`app.json`](../mytopia-auferstanden-app/app.json).
- Synced FCM device tokens to Firestore so backend notifications can target individual users.
- Added text and photo mission runners and connected them to new backend submission endpoints.
- Updated task UI so moderation-backed missions now show the correct state:
  - approved/completed
  - pending review
  - rejected, including moderator note when present
- Updated points/session typing so current points propagate correctly through the app.
- Cleaned up temporary Crashlytics diagnostics/test UI after validation.

## Backend And Data Changes

- Added mission API endpoints for:
  - `POST /text/submit`
  - `POST /photo/submit`
- Added moderation scoring flow:
  - submissions are created as pending
  - moderator review updates the submission
  - `submissionModerated` awards points, mirrors leaderboard data, and sends a targeted push notification
- Moved Firestore and Storage rules/indexes to the functions workspace and aligned them with the new submission schema.
- Updated the canonical submission model to use:
  - `sourceId`
  - `sourceType`
  - `payload`
  - optional moderation fields such as `earnedPoints`, `moderatorNote`, `awarded`, `awardedAt`
- Updated the mission-deletion cleanup path so photo mission submissions also delete their Storage objects under the new schema.
- Added the generic [`set-claim.mjs`](../mytopia-functions/scripts/set-claim.mjs) helper and removed the redundant old dev-only claim script.

## Moderation And Content Tooling

- Extended the Sanity mission schema with `text` and `photo` mission kinds.
- Added a moderation dashboard in `mytopia-website` for pending text/photo submissions.
- Moderators can:
  - review pending submissions
  - approve or reject
  - add moderator notes
  - override awarded points before approval
- Storage rules now allow moderators to read uploaded submission photos while still limiting writes to the submitting user.

## Repo And Tooling Cleanup

- Removed temporary repo-level `tmp` folders and temporary resized image folders created during development.
- Ignored regenerated temp/config artifacts that should not be committed.
- Removed debug logging added during config work.
- Replaced the remaining `npx` React Native log scripts with `bunx`.
- Added `mytopia-website` to the root workspace/dev pipeline so integrated local development reflects the actual deployed surfaces.

## Validation

These checks passed on the current tree:

- `bunx tsc --noEmit -p mytopia-auferstanden-app/tsconfig.json`
- `bun run --cwd mytopia-auferstanden-app lint`
- `bun run --cwd mytopia-functions build`
- `bunx tsc --noEmit -p mytopia-website/tsconfig.json`
- `bun run --cwd mytopia-website lint`
- `git diff --check`

## Operational Notes

- `mytopia-website/` is a separate git repository and still needs its own commit/push before the outer repository gitlink is updated.
- This release depends on coordinated rollout of:
  - native app binary
  - Cloud Functions
  - Firestore rules/indexes
  - Storage rules
  - moderation website
- Moderator photo review requires `admin=true` or `moderator=true` custom claims.
- Loading the dev mission catalog in moderation still requires `dev=true` on the moderator account.

## Known Follow-Up

- Rejected text/photo submissions are now shown correctly in the app, but they are still idempotent per mission/user. A rejected submission cannot currently be revised and resubmitted without a backend policy change. That is acceptable for the current MVP, but it should be an explicit product decision rather than an accidental one.
