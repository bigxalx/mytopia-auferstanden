# AGENTS: Task Tracking Source of Truth

## Task System

- Use Linear as the canonical task system for this repository.
- Workspace/team board: https://linear.app/mytopia
- Team key: `MYT`
- Primary project: `Mytopia Auferstanden Phase 1`

## Daily Work Rule

- When asked for "today's task", check Linear first (assigned issues, due dates, and status).
- Prefer Linear issue identifiers (for example `MYT-9`) in updates and commit/PR context.

## Tooling

- **Always use `bun`** as the package manager (`bun install`, `bun add`, `bun run`, etc.).
- **Always use `bunx`** instead of `npx` for one-off script execution.
- Never use `npm`, `npx`, `yarn`, or `pnpm` in this repository.

## Feed Screen Behavior

- Notfallkanal feed uses scroll-to-last-read positioning: scrolls to bottom if all messages read, or to first unread message with badge.
- List renders hidden with spinner overlay until positioned to prevent visual jump on app start.

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

## Audio Waveforms (@simform_solutions/react-native-audio-waveform)

- **Native Path Parsing:** To render properly across native systems, the component's `path` prop must receive an absolute file path WITHOUT the `file://` prefix (`localPath.replace('file://', '')`). Additionally, sanitize queried URLs to ensure clean file extensions (.mp3/.m4a) during cache download, otherwise the native player will fail.
- **State Lifecycle:** The library's `onChangeWaveformLoadState(state)` provides `true` whilst analyzing peaks, and `false` when finished. Use an `isLoading` conceptual state instead of `isEmpty` or `isLoaded` to avoid inversed loading spinners.
