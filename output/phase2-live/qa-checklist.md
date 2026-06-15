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

## GPS + Time Auto-Check-In

- User with location permission, within 50m of Theater Altenburg Gera, inside
  an active show window auto-joins the active session.
- User outside the 50m venue radius does not auto-join.
- User inside venue radius but outside show window does not auto-join.
- Location permission denial does not block QR join.
- Location failure falls back to manual QR/session join.

## Audience Isolation

- User joined to session receives active live events.
- Signed-in production user not joined to session does not receive
  `Terrorwarnung`.
- User joined to a dev/test session does not receive production events.
- User from a previous expired window does not receive the current event unless
  explicitly joined again.
- Creating/entering the current scheduled window closes older active sessions in
  the same mode.

## Connection Status

- Joined app shows `Live verbunden` when listener and heartbeat are current.
- App shows `Verbinde...` while joining or reconnecting.
- App shows `Offline` when the listener cannot confirm current state.
- Admin page shows recent participant count based on heartbeat.
- Closing/reopening the app restores joined session state when still valid.
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
- If notification permission was already granted, the app sends a short local
  notification burst and cancels pending burst notifications on clear.
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
- Heartbeat resumes after reconnect.
- Admin participant count ages out stale devices.

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
bun run --cwd mytopia-functions build
bun run --cwd mytopia-website build
```
