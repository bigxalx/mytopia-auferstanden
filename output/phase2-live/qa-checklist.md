# Phase 2 Live Interaction QA Checklist

## QR Join

- Admin starts one current session for the selected mode.
- Reloading the admin page still shows the same active QR code.
- Dedicated print page at `/moderation/live/print` renders a current QR poster
  only when a session is active.
- QR/session link opens the app live route.
- Signed-in user joins the current session (`dev-current` or
  `production-current`).
- Joined user sees `Live verbunden` after Firestore listener starts.
- User without GPS permission can still join through QR.
- QR for an expired or inactive session shows a clear unavailable state.
- Starting the current session again does not disconnect already joined users.

## GPS + Time Auto-Check-In

- User with location permission, within 50m of Theater Altenburg Gera, inside
  the show window auto-joins the active session.
- User outside the 50m venue radius does not auto-join.
- User inside venue radius but outside show window does not auto-join.
- Location permission denial does not block QR join.
- Location failure falls back to manual QR/session join.

## Audience Isolation

- User joined to session receives active live events.
- Signed-in production user not joined to session does not receive
  `Terrorwarnung`.
- User joined to a dev/test session does not receive production events.
- User from a previous session does not receive the current session event unless
  explicitly joined.
- Starting the current session closes older active sessions in the same mode.

## Connection Status

- Joined app shows `Live verbunden` when listener and heartbeat are current.
- App shows `Verbinde...` while joining or reconnecting.
- App shows `Offline` when the listener cannot confirm current state.
- Admin page shows recent participant count based on heartbeat.
- Closing/reopening the app restores joined session state when still valid.
- Closing the live session in the admin page removes the joined state on the
  phone and hides `Live verbunden`.

## Terrorwarnung Trigger

- Admin page triggers `terror_alert`.
- Joined app renders full-screen red alarm takeover.
- Alarm title and message are readable on mobile.
- Animation runs without blocking dismissal after clear.
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
- QLab/adaptor `cueId` is stored for audit/debugging.
- Same event state is produced by admin trigger and adaptor trigger.

## Verification Commands

Run after code implementation batches:

```bash
bun run --cwd mytopia-auferstanden-app lint
bun run --cwd mytopia-auferstanden-app tsc --noEmit
bun run --cwd mytopia-functions build
bun run --cwd mytopia-website build
```
