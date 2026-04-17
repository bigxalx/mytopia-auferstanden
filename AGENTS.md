# AGENTS: Task Tracking Source of Truth

## Task System

- Use Linear as the canonical task system for this repository.
- Workspace/team board: https://linear.app/mytopia
- Team key: `MYT`
- Primary project: `Mytopia Auferstanden Phase 1`

## Daily Work Rule

- When asked for "today's task", check Linear first (assigned issues, due dates, and status).
- Prefer Linear issue identifiers (for example `MYT-9`) in updates and commit/PR context.

## Quality Assurance (QA)

- **Verification:** Always verify significant changes by running `bun run lint` and checking for TypeScript errors (`tsc`).
- **Workspace Specifics:**
  - In `mytopia-auferstanden-app/`, use `bun run lint` (runs `expo lint`).
  - In `mytopia-functions/`, use `bun run build` (runs `tsc`).
- **Reminders:** Ensure no new lint warnings or type errors are introduced before concluding a task.

## Tooling

- **Always use `bun`** as the package manager (`bun install`, `bun add`, `bun run`, etc.).
- **Always use `bunx`** instead of `npx` for one-off script execution.
- Never use `npm`, `npx`, `yarn`, or `pnpm` in this repository.

## Feed Screen Behavior

- Notfallkanal feed uses scroll-to-last-read positioning: scrolls to bottom if all messages read, or to first unread message with badge.
- List renders hidden with spinner overlay until positioned to prevent visual jump on app start.

## Notfallkanal Reactions

- Reactions are currently enabled only on the Notfallkanal hub feed, not actor-channel threads.
- Long-press reactions should measure and animate the full visible message row so the focused overlay matches chat layout exactly, including reaction badges.
- Focused reaction dismissal should always use the reverse animation back to the original measured row, including when the user selects or removes an emoji.
- Reaction badges should slightly overlap the message bubble, use the pale actor-channel blue fill, and avoid decorative borders.

## Docs Sync Rule

- `docs/tasks.md` is a local snapshot only and can lag behind Linear.
- Keep planning/status truth in Linear; update docs only for durable context.

## Website Repository Sync (Dual-Push)

- The `mytopia-website/` directory is its own standalone git repository (`mytopia-web`).
- It exists within the monorepo for integrated development (`bun dev` at root runs it via Turbo).
- **Workflow**:
  1. Make changes to `mytopia-website/`.
  2. Commit and push from `mytopia-website/` to its origin (to trigger the standalone CI/CD production deployment).
  3. Update and commit the `mytopia-website/` gitlink in the outer monorepo optionally to keep the main repo in sync with the current deployment version.

## Audio Waveforms (expo-audio & react-native-audio-analyzer)

- **Native Path Parsing:** To extract amplitude data via `react-native-audio-analyzer` (`computeAmplitude`), the path must be an absolute file path WITHOUT the `file://` prefix. Always format and cache downloaded audio with valid extensions.
- **Waveform UI Rendering:** Implement waveforms using flat SVG components (e.g. mapping simple `<Rect>` elements and calculating sub-pixel `barW` and `gapW`). Avoid using `<ClipPath>` for playback progress tracking, as React Native SVG struggles to dynamically invalidate standard SVG nodes masked inside ClipPaths natively on Android.
- **Playback Animation Smoothness:** Pass `{ updateInterval: 50 }` to `useAudioPlayer` from `expo-audio` to lock progress rendering to ~20FPS or better for buttery smooth waveform sweeps.

## Missions & Active Channels

- **Submission API Limits:** Never use raw repository submit calls (like `submitTextMission`, `submitGpsCompletion`) inside channel elements. 
- **Active Context Default:** Always employ `completeMission(missionId, payload)` provided by `useActiveMission()`. It injects necessary `channelMeta` so moderation pipelines can return feedback directly, and creates immediate optimistic `submissionAttachment` feed bubbles so the UI provides immediate response certainty.
- **Mission Input Chrome:** Keep inline mission input UIs clean and minimal. Do not reintroduce the old left accent bar or `Aktive Mission` label in chat composers.
- **System Message Tone:** Chat status/system messages should stay in normal sentence case, not forced uppercase, and keep vertical spacing tight.
- **GPS Chat UI:** Embedded GPS mission UI should use a standard rectangular map thumbnail, centered `Wegbeschreibung` CTA, and only show `Einchecken` once the user is inside the target radius.
- See `docs/actor-channel-submissions.md` for extended details.
