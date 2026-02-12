# Project Brief

## Working Title

Mytopia Auferstanden

## Objective

Build a new mobile app (iOS/Android) for the theatre production that continues the Mytopia universe while starting from a clean technical baseline.

The app should:

- deliver narrative content (news, push notifications, media),
- provide interactive tasks (quiz, GPS, free text, photo proof),
- support points and rank-based mechanics,
- recognize returning users from the previous app and welcome them.

Returning users are expected to:

- log in with existing credentials,
- receive a dedicated welcome-back flow,
- see legacy points summary and rank snapshot.

## Product Direction

- Greenfield app implementation.
- Reuse backend capabilities where it reduces risk and time (especially Firebase auth and selected user continuity).
- Keep old app available, but launch this app as a new store listing.

## Team

- Sophie: dramaturgy, writing for theatre.
- Manuel: writing for theatre.
- Anton: app content owner and editorial delivery.
- Armin: product development and UI design, with optional external art support.

## Scope by Phase

## Phase 1 (before premiere, city-space interactions)

- Story delivery through messages (text/image/audio/video) with push notifications.
- Tasks:
  - Quiz
  - GPS
  - Free text input
  - Photo upload proof
- Manual review workflow for free text and photo submissions.
- Points, badges/streaks (if feasible in time), private ranking visibility.
- Wordcloud-style aggregate output from reviewed text submissions.

## Phase 2 (live performance interactions)

- Live app-stage interaction committed, unless technical PoC clearly fails.
- Candidate integration path includes adaptor:ex and stage projection/trigger workflows.

## Non-Goals for Initial Build

- Full migration of old mobile codebase.
- Public global leaderboard.
- Complex branching story logic in Phase 1.
