# Linear Project Spec: Mytopia Phase 2 Live-Interaktion

## Project

Name: `Mytopia Phase 2 Live-Interaktion`

Team: `Summarizoor`

Priority: High

Summary:

QR-gated live show session for Mytopia with Firebase realtime events, admin
trigger surface, app alarm takeover, and later adaptor:ex / QLab integration.

Description:

Phase 2 turns the existing app into a live show channel during performances.
Users join the current show session through a QR/session link or live bar.
GPS filters the live bar locally when location is available; without location,
the active time window permits remote joining. Live events are written by Firebase
Functions and delivered to joined app users through Firestore realtime
listeners. The MVP starts with `Terrorwarnung`: an admin/adaptor trigger causes
joined devices to show a full-screen alarm overlay. Users not joined to the
session must never receive the event.

The first trigger surface is a hidden authenticated admin page on
`mytopia.world`. Later, adaptor:ex will call the same Firebase event endpoint
from the theatre chain: `QLab -> adaptor:ex -> Firebase -> app`.

## Milestones

1. `M1 - Planning + Docs`
   - Target: 2026-06-11
   - Outcome: architecture docs, schema docs, adaptor handoff, QA checklist, and
     Linear project structure are ready.

2. `M2 - Frontend Live Session MVP`
   - Target: 2026-06-18
   - Outcome: app can join a live session, show connection status, and render the
     `Terrorwarnung` takeover from simulated/realtime state.

3. `M3 - Firebase Live Backend + Admin Trigger`
   - Target: 2026-06-25
   - Outcome: functions endpoints, Firestore rules, session/event storage, and
     hidden website admin trigger are working together.

4. `M4 - Integration Prep Before 3 July`
   - Target: 2026-07-03
   - Outcome: adaptor-facing endpoint contract, credentials requirements,
     theatre handoff docs, and pre-summer-pause test checklist are complete.

5. `M5 - adaptor:ex / QLab Integration`
   - Target: TBD after Anton K. provides adaptor access and crash course.
   - Outcome: QLab/adaptor trigger can create the same Firebase live event as the
     admin page.

## Initial Issues

### Documentation and architecture

Goal:

Create durable docs for live interaction architecture, Firestore model, adaptor
handoff, QA checklist, and project plan.

Acceptance:

- `docs/live-interaction-architecture.md` exists.
- `docs/firestore-v2-schema.md` includes live sessions/events.
- `output/phase2-live/adaptor-handoff.md` exists.
- `output/phase2-live/qa-checklist.md` exists.

### Live session schema/rules

Goal:

Define and implement Firestore collections/rules for live sessions,
participants, and live events.

Acceptance:

- Session docs store metadata, venue gate, time window, active event, and mode.
- Participant docs track explicit membership scoped to one performance run.
- Event docs track `terror_alert` active/cleared lifecycle.
- Direct client event writes are rejected.

### Firebase live event API

Goal:

Add authenticated Function routes for joining/leaving a session, triggering
events, clearing events, and handling scheduled run boundaries.

Acceptance:

- App can join via QR token or GPS/time check.
- Admin can trigger and clear `terror_alert`.
- adaptor-compatible trigger contract is available.
- API validates auth, mode, session status, and source permissions.

### QR join flow

Goal:

Add app handling for QR/session links.

Acceptance:

- QR opens the app live route with session id/token.
- Signed-in users can join the session.
- Joined state persists locally and is scoped to the current performance run.
- Users without GPS permission can still join via QR.

### GPS+time join

Goal:

Offer explicit joining during the active show window, using GPS locally when it
is available and time-only joining when it is not.

Acceptance:

- The live bar only appears for an active session and applies the local venue
  check when location is available.
- Location permission denial does not block QR join.
- Users without location can join remotely during the active time window.
- Device coordinates are never sent to or stored by the backend.

### Live connected state

Goal:

Show reliable live connection status in the app and participant counts in admin.

Acceptance:

- App status states: `Live verbunden`, `Verbinde...`, `Offline`.
- Join/leave actions update participant connection metadata; there is no heartbeat.
- Admin page shows connected participants for the active run.

### Terrorwarnung takeover UI

Goal:

Render the first live event as a full-screen app takeover.

Acceptance:

- Joined users see animated red alarm screen when event is active.
- Non-joined users never see the alarm.
- Clear event dismisses overlay and returns user to prior app state.
- Offline/reconnect behavior restores the correct current event state.

### Hidden website admin trigger page

Goal:

Build an authenticated admin page on `mytopia.world` for testing and operations.

Acceptance:

- Page is hidden from public navigation.
- Admin can copy QR/session link.
- Admin can trigger and clear `Terrorwarnung`.
- Page calls the same Function endpoint planned for adaptor.

### adaptor endpoint contract

Goal:

Prepare theatre integration contract for Anton K. and adaptor:ex.

Acceptance:

- Handoff doc names endpoint, auth method placeholder, request payload, response
  shape, and required session id.
- Contract supports `QLab -> adaptor:ex -> Firebase`.
- Credentials/access placeholders remain until Anton provides details.

### QA and theatre handoff checklist

Goal:

Define verification scenarios before implementation and theatre testing.

Acceptance:

- QR join, GPS/time joining, run isolation, trigger/clear, reconnect,
  and adaptor dry-run scenarios are listed.
- Verification commands are documented.

## Dependencies and Blockers

- adaptor access and credentials from Anton K. are pending.
- Anton K. will provide an adaptor crash course with Lena Biresch.
- 3 July 2026 is the last working day before summer pause.
- Stage currently uses QLab.
- Backend adaptor integration cannot be completed until adaptor access exists,
  but frontend/admin/Firebase work can start immediately.

## Implementation Order

1. Planning/docs.
2. Backend contract and Firestore model.
3. App live session join/listener/alarm UI.
4. Website admin trigger.
5. adaptor:ex / QLab integration and theatre test.
