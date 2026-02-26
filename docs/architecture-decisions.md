# Architecture Decisions (Draft)

This file captures working decisions and unresolved choices.

## Confirmed Decisions

1. New app listing in stores.
2. Greenfield app implementation.
3. Old code is reference material, not migration baseline.
4. Returning users should be recognized and welcomed in the new app.
5. User-generated submissions can be used publicly during show context, with explicit user permission via email and retention until end of 2026.
6. Phase 2 live integration is a commitment unless PoC clearly fails.
7. Returning users can reuse old login credentials and will receive a dedicated welcome-back screen.
8. Welcome-back continuity should include both legacy points summary and legacy rank snapshot.
9. Migration communication from old app to new app should be multi-wave (teaser, beta invite, launch push).
10. Moderation ownership is Anton plus a theatre moderation team.
11. Ranking should be season-specific, with season control managed through CMS configuration.
12. Phase 1 MVP scope is locked as Lean MVP (auth continuity, feed/push baseline, quiz/GPS loops, scoring, private ranking/profile).
13. Firebase continuity strategy is locked as same project + clean new namespace + legacy summary import.

## Tentative Decisions

1. Keep carry-over from old app lightweight, as summarized legacy status rather than full detail migration.

## Proposed Technical Direction

## Mobile App

- React Native + Expo (current baseline stack).
- Clean navigation and feature modules (auth, feed, tasks, profile, rankings).
- Feature flags for risky/non-critical modules (badges/streaks/wordcloud).

## Backend

- Firebase Auth reused for account continuity.
- Firestore for user state, scoring, submissions, moderation states.
- Cloud Functions for ranking calculation, carry-over import logic, and moderation actions.
- Firebase Storage for photo evidence uploads.
- Current default is same Firebase project with a clean new data namespace, pending final decision.

## Content System

Decision pending between Contentful and Sanity.

Recommendation under current timeline pressure:

- Use the platform that gives Anton the fastest reliable content operations with the least integration overhead.
- If undecided by deadline, default to Contentful for Phase 1 and revisit post-launch.

## Admin Moderation

Build a dedicated lightweight web interface (not the current static `mytopia-web` pages).

MVP requirements:

- queue of pending submissions,
- filters (task/date/user/state),
- detail view (text/photo),
- approve/reject,
- manual point assignment,
- audit log.

Moderators:

- Anton,
- theatre moderation team accounts with scoped access.

## Data Migration and Continuity

Recommended continuity model:

1. New app login recognizes returning Firebase user.
2. Legacy data import runs once on first login or on-demand function.
3. New app stores:
   - `legacySummary.totalPoints`
   - `legacySummary.rankSnapshot`
   - `legacySummary.importedAt`
4. Welcome message can reference this summary and optionally grant one-time bonus.

This keeps new data model clean while preserving continuity.

Ranking rule:

- legacy summary is display/context only,
- active season ranking is computed only from new season activity.

## Open Source Considerations

- Secret hygiene and key rotation required before any public push.
- License must be confirmed with theatre/legal stakeholders.
- If non-commercial license blocks adoption goals, consider permissive or copyleft alternative.
