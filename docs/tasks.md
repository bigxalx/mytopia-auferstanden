# Main Task Board

Canonical execution file for this project.

Use this file to track what is next, who owns it, and what is blocked.

## How To Use This File

1. Keep statuses updated (`todo`, `doing`, `blocked`, `done`).
2. Use owner tags (`Armin`, `Anton`, `Sophie/Manuel`, `Theatre Team`).
3. Link all detailed context to supporting docs instead of duplicating text.
4. Keep this file as the single planning truth for active work.

## Priority 0: Decision Locks (This Week)

| Task | Owner | Due | Status | Notes / Links |
| --- | --- | --- | --- | --- |
| Lock CMS (Contentful vs Sanity) | Armin + Anton | February 13, 2026 | `todo` | Critical gate. See [open-questions.md](open-questions.md), [roadmap.md](roadmap.md). |
| Lock Firebase strategy (recommended: same project + new namespace) | Armin | February 14, 2026 | `todo` | See [decision-guides.md](decision-guides.md). |
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
| Confirm Apple/Google account status and escalation owner | Theatre Team | February 17, 2026 | `todo` | Track in this file under External Dependencies. |
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

## External Dependencies Tracker

| Dependency | Owner | Needed By | Status | Escalation |
| --- | --- | --- | --- | --- |
| CMS decision | Armin + Anton | February 13, 2026 | `todo` | Block implementation if late. |
| Store account readiness | Theatre Team | Before Sprint 2 | `todo` | Escalate weekly until confirmed. |
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
