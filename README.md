# Mytopia Auferstanden

Greenfield React Native app for a theatre production sequel in the Mytopia universe.

Current focus is pre-production planning and implementation setup.

## Quick Links

- [Action Brief](docs/README.md)
- [Linear Team Board (Source of Truth)](https://linear.app/mytopia)
- [Task Board Snapshot (Legacy)](docs/tasks.md)
- [Project Brief](docs/project-brief.md)
- [Project Context (DE): Erweiterung Projekt √My](docs/project-context-sqrtmy-de.md)
- [Roadmap](docs/roadmap.md)
- [Architecture Decisions](docs/architecture-decisions.md)
- [Open Questions](docs/open-questions.md)
- [Decision Guides](docs/decision-guides.md)
- [Narrative Feed Ops Runbook](docs/narrative-feed-ops.md)

## Project Scope

- New app listing (old app remains separate).
- Selective backend continuity (returning login + legacy summary).
- Phase 1 city-space interactions before festival launch.
- Phase 2 live integration before premiere.

## Timeline Highlights

- February 13, 2026: CMS decision deadline.
- March 15, 2026: testing start.
- April 30, 2026: latest store submission date.
- May 20, 2026: launch target.
- September 18, 2026: premiere.

## Calendar Imports

- [critical-milestones.ics](calendar/critical-milestones.ics)
- [team-deadlines.ics](calendar/team-deadlines.ics)
- [calendar notes](calendar/README.md)

## Repository Notes

This README is kept suitable for open-source repository usage.

Internal execution context is maintained in:

- Linear (`https://linear.app/mytopia`, Team `MYT`) for active task tracking
- [docs/README.md](docs/README.md)
- [docs/tasks.md](docs/tasks.md) as a non-canonical snapshot

## Workspace Packages

This repository is a Bun workspace monorepo:

1. `mytopia-auferstanden-app` (Expo React Native app)
2. `mytopia-content-studio` (Sanity Studio for narrative content)
3. `mytopia-functions` (Firebase Functions: Sanity webhook, release handler, feed proxy)

Root scripts:

- `bun run dev:app`
- `bun run dev:studio`
- `bun run deploy:functions`
