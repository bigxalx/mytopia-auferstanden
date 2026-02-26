# Main Task Board (Legacy Snapshot)

As of February 23, 2026, canonical task tracking moved to Linear:

- Workspace/Team board: https://linear.app/mytopia
- Team key: `MYT`
- Primary project: `Mytopia Auferstanden Phase 1`

This file is kept as a local planning snapshot and may be outdated.

## How To Use This File

1. Treat this file as reference context; update critical notes only when useful.
2. Use owner tags (`Armin`, `Anton`, `Sophie/Manuel`, `Theatre Team`).
3. Link all detailed context to supporting docs instead of duplicating text.
4. Use Linear as the single planning truth for active work.

## Priority 0: Decision Locks (This Week)

| Task | Owner | Due | Status | Notes / Links |
| --- | --- | --- | --- | --- |
| Lock Phase 1 MVP scope and cutline (Option A) | Armin | February 17, 2026 | `done` | Lean MVP selected: auth continuity, feed/push, quiz+GPS, scoring, private ranking. |
| Lock CMS (Contentful vs Sanity) | Armin + Anton | February 19, 2026 | `done` | Sanity selected for Phase 1 (schema-in-code, git-versioned model changes). |
| Lock Firebase strategy (Option B: same project + clean new namespace) | Armin | February 17, 2026 | `done` | Reuse Auth users, import legacy summary only, keep season ranking independent. |
| Lock moderation tooling path (hybrid vs custom-now) | Armin | February 14, 2026 | `todo` | See [decision-guides.md](decision-guides.md). |
| Lock OSS code license direction | Armin + Theatre Team | February 18, 2026 | `todo` | See [decision-guides.md](decision-guides.md). |
| Lock moderation SLA target | Anton + Theatre Team | February 20, 2026 | `todo` | See [open-questions.md](open-questions.md). |

## Sprint 0: Foundations and Risk Reduction

Window: now to February 20, 2026

| Task | Owner | Due | Status | Notes / Links |
| --- | --- | --- | --- | --- |
| Finalize architecture baseline from decisions | Armin | February 16, 2026 | `todo` | [architecture-decisions.md](architecture-decisions.md). |
| Create implementation repo skeleton and environment conventions | Armin | February 16, 2026 | `todo` | Depends on Firebase/CMS lock. |
| Define clean season data model with legacy summary fields | Armin | February 17, 2026 | `todo` | [decision-guides.md](decision-guides.md), [architecture-decisions.md](architecture-decisions.md). |
| Confirm Apple/Google account status and escalation owner | Theatre Team | February 17, 2026 | `done` | Accounts confirmed working with test uploads. |
| Nominate moderation team members | Anton + Theatre Team | February 20, 2026 | `todo` | Track in this file under External Dependencies. |
| Confirm editorial workflow (write/approve/publish) | Anton + Sophie/Manuel | February 20, 2026 | `todo` | Track in this file under External Dependencies. |

## Sprint 1: Playable Alpha

Window: February 20, 2026 to March 15, 2026

| Task | Owner | Due | Status | Notes / Links |
| --- | --- | --- | --- | --- |
| Implement auth + returning user welcome-back flow | Armin | March 1, 2026 | `todo` | Include legacy points + rank snapshot. |
| Implement narrative feed + push baseline | Armin | March 5, 2026 | `todo` | CMS decision required. |
| Implement quiz and GPS task loops with scoring | Armin | March 8, 2026 | `todo` | Core gameplay loop. |
| Provide first testing content package | Anton | March 10, 2026 | `todo` | Narrative + tasks + moderation rubric. |
| UGC prototype (text/photo submit) | Armin | March 12, 2026 | `todo` | Optional MVP in Sprint 1. |
| Testing protocol and cohort confirmation | Anton + Armin | March 13, 2026 | `todo` | Needed before test start. |
| Test kickoff | Team | March 15, 2026 | `todo` | Milestone in [roadmap.md](roadmap.md). |

## Design Track: UX and Visual Design (Phase 1)

Window: February 17, 2026 to March 10, 2026

| Task | Owner | Due | Status | Notes / Links |
| --- | --- | --- | --- | --- |
| Lock UX scope and critical user journeys (auth, feed, task completion, profile) | Armin + Anton | February 19, 2026 | `doing` | Must match MVP cutline. |
| Produce low-fidelity wireframes for core MVP screens | Armin | February 24, 2026 | `todo` | Fast validation before visual polish. |
| Lock visual direction (typography, palette, icon style, component primitives) | Armin + Sophie/Manuel | February 26, 2026 | `todo` | Needed before high-fidelity designs. |
| Produce high-fidelity designs for Sprint 1 scope | Armin | March 3, 2026 | `todo` | Includes auth, home/feed, task flow, profile/rank. |
| Interactive prototype review and sign-off | Team | March 6, 2026 | `todo` | Usability pass before implementation sprint close. |
| Export implementation-ready design assets/specs | Armin | March 10, 2026 | `todo` | Icons, spacing/type specs, states, store screenshots draft. |

## External Dependencies Tracker

| Dependency | Owner | Needed By | Status | Escalation |
| --- | --- | --- | --- | --- |
| CMS decision | Armin + Anton | February 13, 2026 | `todo` | Block implementation if late. |
| Store account readiness | Theatre Team | Before Sprint 2 | `done` | Apple/Google accounts set up and test uploads verified. |
| Legal copy and OSS approval | Theatre Team | Before store submission | `todo` | Needed for release and public repo. |
| Moderation team availability | Anton + Theatre Team | Before UGC rollout | `todo` | Needed for operational readiness. |

## Migration Communications (Old App -> New App)

| Message Wave | Owner | Target Window | Status | Notes |
| --- | --- | --- | --- | --- |
| Teaser message | Anton + Sophie/Manuel | Pre-beta | `todo` | Introduce upcoming app transition. |
| Beta invite message | Anton | Beta window | `todo` | Drive early testers. |
| Launch migration message | Anton + Armin | Launch week | `todo` | Include deep link to new app listing. |

## Linked Reference Docs by Topic

## Strategy

- [README.md](README.md)
- [project-brief.md](project-brief.md)
- [architecture-decisions.md](architecture-decisions.md)
- [open-questions.md](open-questions.md)

## Delivery and Scheduling

- [roadmap.md](roadmap.md)
- [decision-guides.md](decision-guides.md)

## Calendar Imports

- [../calendar/critical-milestones.ics](../calendar/critical-milestones.ics)
- [../calendar/team-deadlines.ics](../calendar/team-deadlines.ics)
