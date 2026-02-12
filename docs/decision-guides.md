# Decision Guides

Short option guides for the decisions that can impact timeline and architecture.

## 1) Firebase Reuse Strategy

## Option A: Same Firebase project, reuse old user docs directly

Pros:

- fastest to start.
- minimal migration code.

Cons:

- legacy schema complexity leaks into new app.
- harder long-term maintainability.

## Option B: Same Firebase project, new clean season namespace (recommended)

Pros:

- keeps greenfield architecture clean.
- preserves login continuity.
- moderate implementation effort.

Cons:

- requires one-time legacy summary import logic.

Recommended shape:

- keep Auth users,
- new season collections/fields,
- store `legacySummary.totalPoints`, `legacySummary.rankSnapshot`, `legacySummary.importedAt`,
- season rank remains independent from legacy score.

## Option C: New Firebase project + migration

Pros:

- cleanest isolation.

Cons:

- highest effort and risk,
- migration complexity likely too high for current timeline.

Recommendation:

- choose Option B.

## 2) Moderation Dashboard Path

## Option 1: Low-code first

Pros:

- fastest moderation MVP.

Cons:

- vendor dependency,
- limited customization.

## Option 2: Custom Next.js now

Pros:

- full control and long-term fit.

Cons:

- slower initial delivery.

## Option 3: Hybrid (recommended)

Approach:

1. low-code for MVP speed,
2. custom dashboard once workflow stabilizes,
3. cutover decision by end of Sprint 2.

Recommendation:

- choose Option 3 unless custom-now capacity is clearly available.

## 3) Open Source License Direction

## Practical options for code

- MIT / Apache-2.0: easiest adoption.
- MPL-2.0: balanced (file-level copyleft).
- GPL/AGPL: stronger copyleft, higher friction.
- CC non-commercial: not ideal for software code.

Recommendation:

1. Prefer MPL-2.0 if you want reciprocity with manageable friction.
2. Prefer MIT/Apache-2.0 if adoption simplicity is top priority.
3. Keep media/assets under separate rights policy if needed.

