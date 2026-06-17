# Phase 2 Live Interaction QA Checklist

## QR Join

- Admin creates one live show window for the selected mode.
- Reloading the admin page still shows the same reusable QR code.
- Dedicated print page at `/moderation/live/print` renders the reusable QR
  poster even when no session is active.
- QR/session link opens the app live route.
- During an active show window, a signed-in user joins the current session
  (`dev-current` or `production-current`).
- Joined user sees `Live verbunden` after Firestore listener starts.
- User without GPS permission can still join through QR.
- QR before the next show window shows the next possible live time and does not
  join.
- QR screen updates automatically when the show window becomes active without
  needing to rescan.
- QR with no upcoming show window shows a clear unavailable state and does not
  join.
- Reusing the same printed QR across multiple show windows works without
  reprinting.

## GPS + Time Join

- User with location permission, within 50m of Theater Altenburg Gera, inside
  an active show window sees the live bar and can explicitly join.
- User outside the 50m venue radius with an available location does not see the
  bar and is rejected locally if the route is already open.
- User with denied permission or unavailable GPS still sees the bar and can join
  remotely during the active time window using `auto-time-only`.
- User inside venue radius but outside the show window cannot join.
- Location permission denial does not block QR join.
- Join requests never include device coordinates or calculated distance.

## Audience Isolation

- User joined to session receives active live events.
- Signed-in production user not joined to session does not receive
  `Terrorwarnung`.
- User joined to a dev/test session does not receive production events.
- User from a previous expired window does not receive the current event unless
  explicitly joined again.
- Participant membership and event reads require a run id matching the active
  performance.
- Offline and previous-run participant documents cannot read current event data.
- Push delivery and moderator connected counts include only the active run.
- Creating/entering the current scheduled window closes older active sessions in
  the same mode.

## Connection Status

- Joined app shows `Live verbunden` after the current run's session listener is
  active.
- App shows `Verbinde...` while joining or reconnecting.
- App shows `Offline` when the listener cannot confirm current state.
- Admin page shows connected participants for the active run. This is explicit
  membership, not a heartbeat-based liveness count.
- Closing/reopening the app restores joined session state when still valid.
- Closing/reopening the app does not restore membership if the run id changed.
- When the show window ends, the phone removes joined state and hides
  `Live verbunden`.
- Advanced manual end removes joined state on the phone and hides
  `Live verbunden`.

## Terrorwarnung Trigger

- Admin page triggers `terror_alert`.
- Joined app renders full-screen red alarm takeover.
- Alarm title and message are readable on mobile.
- Animation runs without blocking dismissal after clear.
- Device vibrates while the alarm overlay is active.
- If notification permission was already granted, the backend sends four
  identical spoiler-free FCM notifications to connected users in the active run.
- If notification permission was not granted, the app does not ask for
  permission during the alarm.
- Trigger is idempotent enough that repeated clicks do not create confusing
  duplicate overlays.

## Clear Event

- Admin page clears active event.
- App dismisses alarm overlay and returns to prior screen.
- App that reconnects after clear does not show stale alarm.
- Clear action is recorded with source/admin metadata.

## Offline and Reconnect

- App offline during trigger shows correct active event after reconnect.
- App offline during clear dismisses after reconnect.
- Explicit disconnect marks the participant offline.
- Starting another run excludes old participant records without deleting audit
  history.

## Scheduled Boundaries

- Creating a window schedules authenticated Cloud Tasks for start and close.
- A start task activates the run only if the window still has the expected start
  time and is currently active.
- A close task closes only the matching run and expected end time.
- Editing or cancelling a window invalidates or removes its previous tasks.
- A stale task from a rescheduled or superseded window is a successful no-op.
- Repeated availability polling does not update the session while it already
  matches the active window.

## adaptor Dry Run

- adaptor or test HTTP client can call trigger endpoint with target session id.
- Invalid/missing adaptor credential is rejected.
- Invalid session id is rejected.
- Trigger outside an active show window or debug session is rejected with a clear
  no-active-window error.
- QLab/adaptor `cueId` is stored for audit/debugging.
- Same event state is produced by admin trigger and adaptor trigger.

## Advanced Debug

- Advanced section is collapsed by default.
- Manual debug start creates a short active session without rotating the QR
  token.
- Production manual debug start asks for explicit confirmation.
- Manual end closes the session, clears active events, and marks participants
  offline.

## Verification Commands

Run after code implementation batches:

```bash
bun run --cwd mytopia-auferstanden-app lint
bun run --cwd mytopia-auferstanden-app tsc --noEmit
bun test mytopia-auferstanden-app/tests/liveMembership.test.mjs
bun run --cwd mytopia-functions build
bun run --cwd mytopia-functions test:rules
bun run --cwd mytopia-website build
```
