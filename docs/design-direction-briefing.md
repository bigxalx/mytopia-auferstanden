# Design Direction Briefing (Phase 1)

Updated: February 17, 2026

## Decision Logging Policy

1. Operational decisions live in Linear comments on the respective decision issue (`MYT-*`).
2. Durable technical decisions are mirrored in `architecture-decisions.md`.
3. Design exploration outcomes (direction, prompts, rationale) are captured in this file and in the linked Linear design document.

## CMS Recommendation

Preferred: `Sanity`.

Why:

- Schema in code aligns with engineering workflow and review.
- Model changes are versioned in git.
- Better fit for greenfield architecture with Option B Firebase strategy.

Guardrails:

- Keep MVP schema minimal (`FeedItem`, `Task`, `QuizTask`, `GpsTask`, `GlobalSettings`).
- Avoid custom Studio complexity during Sprint 1.
- If schedule risk increases, define fallback to Contentful for Sprint 1 only.

## Lo-Fi Wireframing Recommendation

Recommended tool: `Figma` (same file as hi-fi).

Suggested page structure:

1. `00 User Flows`
2. `01 Lo-Fi Wireframes`
3. `02 UI Direction`
4. `03 Hi-Fi`

## Design Directions To Explore

1. Cinematic Dystopian
2. Civic Minimal
3. Techno-Mythic

## Prompt Kit For Mood Exploration

Use this structure for each direction:

- `2 UI assets` (in-app feeling)
- `2 promo assets` (App Store style atmosphere)

### Shared Story Context Block (prepend to every prompt)

`Mytopia` is a participatory theatre universe. Audience members receive narrative "emergency" messages, complete missions in the city (quiz and GPS), gain points, and see a private ranking. Tone is urgent, civic, and mysterious; the world blends social collapse, reconstruction, and collective decision-making. This is Phase 1 before live on-stage interaction.

### Global Constraint Block

For UI prompts:

`UI ONLY. Full-bleed 2D mobile app interface. No phone device render, no hand, no environment mockup, no 3D perspective, no watermark.`

For promo prompts:

`PROMO KEY ART ONLY. No UI overlays unless explicitly requested. No watermark.`

## Direction 1: Cinematic Dystopian

1. UI asset A (Home/Feed)
`{STORY_CONTEXT} Create a cinematic dystopian home/feed screen for Mytopia with an urgent alert card, narrative feed card, active mission card, private rank chip, and one strong primary action. Editorial hierarchy, dramatic contrast, clear readability, subtle texture grain, restrained complexity. Palette: charcoal, bone, rust-red alerts, muted cyan utilities. {UI_CONSTRAINTS}`

2. UI asset B (Mission Detail)
`{STORY_CONTEXT} Create a mission detail screen with countdown urgency badge, short narrative excerpt, objective checklist, score reward, and confirm action. Tension-filled but elegant, high-contrast typography, clear spacing rhythm. Palette: charcoal base with rust-red urgency and muted cyan system accents. {UI_CONSTRAINTS}`

3. Promo asset A (Store hero)
`{STORY_CONTEXT} Create cinematic promotional key art for app store listing: a city under emergency tension and reconstruction, atmospheric fog, symbolic communication signals, human-scale stakes, premium editorial lighting, no characters in close portrait focus. Palette: charcoal, bone, rust-red, muted cyan. {PROMO_CONSTRAINTS}`

4. Promo asset B (Narrative scene)
`{STORY_CONTEXT} Create a narrative promo scene showing collective urban mission energy: wayfinding clues, distant public infrastructure, ambient alarm mood, subtle hope within dystopia. Filmic composition, premium texture detail, not cyberpunk neon. {PROMO_CONSTRAINTS}`

## Direction 2: Civic Minimal

1. UI asset A (Tasks Overview)
`{STORY_CONTEXT} Create a clean civic-minimal tasks overview screen with progress summary, three task cards (quiz, location, response), points per task, and a calm primary action. Accessibility-first hierarchy, generous whitespace, restrained decoration. Palette: off-white, slate text, forest-green accent, muted amber highlight. {UI_CONSTRAINTS}`

2. UI asset B (Profile/Ranking)
`{STORY_CONTEXT} Create a profile and private ranking screen with user status, current score, rank snapshot, and recent mission history. Calm information design, clear data grouping, trustworthy and neutral tone. Palette: off-white, slate, forest-green accent. {UI_CONSTRAINTS}`

3. Promo asset A (Store hero)
`{STORY_CONTEXT} Create civic-minimal promotional key art for app store: city participation, coordinated missions, calm authority, public trust, modern print-like composition, soft geometry. Bright but restrained, no sci-fi styling. {PROMO_CONSTRAINTS}`

4. Promo asset B (Mission mood)
`{STORY_CONTEXT} Create a clean promo visual centered on collective action and progress tracking in urban space, with subtle map-like abstraction and editorial simplicity. Soft daylight mood, minimal but premium. {PROMO_CONSTRAINTS}`

## Direction 3: Techno-Mythic

1. UI asset A (Mission Timeline)
`{STORY_CONTEXT} Create a techno-mythic mission timeline screen blending ritual symbolism with modern mission-control UI. Include alert state, timeline milestones, faction identity chip, and confirm action. Precise grid with symbolic motifs integrated subtly. Palette: deep indigo, bronze, ash, electric teal accents. {UI_CONSTRAINTS}`

2. UI asset B (Alert Broadcast)
`{STORY_CONTEXT} Create an emergency broadcast UI screen with high-priority message, action choices, and consequence hinting. Mysterious ceremonial tone with disciplined interaction design and strong legibility. Palette: deep indigo base, bronze highlights, electric teal signal accents. {UI_CONSTRAINTS}`

3. Promo asset A (Store hero)
`{STORY_CONTEXT} Create techno-mythic promotional key art for app store: symbolic civic ritual meets contemporary systems interface, abstract glyph structures, map fragments, collective mission atmosphere. Premium and controlled, not fantasy character art. {PROMO_CONSTRAINTS}`

4. Promo asset B (World mood)
`{STORY_CONTEXT} Create a moody world-building promo visual expressing hidden systems, civic myth, and coordinated public missions in a transformed city. Ceremonial tension with modern clarity, elegant and cinematic. {PROMO_CONSTRAINTS}`
