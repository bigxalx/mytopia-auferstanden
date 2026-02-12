# Open Questions and Decisions Needed

This list is ordered by impact and urgency.

## Must Decide This Week

1. CMS for Phase 1: Contentful or Sanity?
2. Firebase reuse strategy:
   - same project and mostly existing user docs,
   - same project but new clean season namespace plus legacy summary import,
   - new Firebase project with account migration/import.
3. Open-source license target for this new repo:
   - permissive,
   - copyleft,
   - non-commercial variant?
4. Admin moderation implementation approach:
   - custom lightweight Next.js dashboard,
   - low-code tool MVP (for speed), then custom later?
5. Confirm season ranking policy with theatre stakeholders:
   - season-only rank (working default),
   - any legacy effect on current season rank.

## Must Decide Before Sprint 1 End

1. Content operations ownership model:
   - who publishes/schedules pushes,
   - who owns final approval,
   - escalation path for urgent changes.
2. Moderation SLA:
   - same-day review,
   - next-day,
   - event-window only.
3. Submission scoring policy:
   - fixed points per approved submission,
   - manual points only,
   - hybrid.
4. Anti-abuse policy:
   - max uploads/day,
   - duplicate protection,
   - moderation rejection reasons shown to users or not.
5. Privacy and consent details:
   - exact consent text for public use in show context,
   - withdrawal handling process after consent,
   - retention/deletion execution owner.

## Must Decide Before Store Submission

1. Final legal texts and in-app disclosures.
2. Final design language and asset ownership clearance.
3. Migration communication in old app:
   - teaser copy,
   - beta invite copy,
   - launch copy and deep link behavior.
4. Launch operations:
   - release day owner,
   - hotfix protocol,
   - incident contact rotation.

## Phase 2 Technical Decision Questions

1. adaptor:ex integration contract and interfaces:
   - event format,
   - transport (websocket/http),
   - latency thresholds.
2. Fallback if PoC underperforms:
   - reduced app interaction mode,
   - staged manual fallback.
3. On-site network assumptions:
   - dedicated Wi-Fi,
   - mobile network fallback,
   - offline behavior expectations.
