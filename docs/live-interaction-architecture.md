# Live Interaction Architecture

This document defines the Phase 2 live interaction architecture for the show
runtime. It is the implementation baseline for QR-gated live sessions, realtime
Firebase events, the app alarm takeover, and the later theatre integration via
QLab and adaptor:ex.

## Runtime Flow

The target show-control path is:

```text
QLab -> adaptor:ex -> Firebase Function -> Firestore realtime -> mobile app
```

The first testable path is:

```text
mytopia.world admin page -> Firebase Function -> Firestore realtime -> mobile app
```

Both paths call the same Firebase live-event API. The admin page is therefore an
early production tool, not a throwaway mock. It lets the app, backend, and
Firestore state model be built before Anton K. provides adaptor access and the
theatre-side integration is ready.

## Realtime Transport

The MVP uses Firestore realtime listeners as the app transport.

Reasons:

- The mobile app already uses Firestore `onSnapshot` listeners for narrative
  state updates.
- Firestore is a good fit for stateful show events such as `terror_alert`
  becoming `active` or `cleared`.
- Firebase Auth and Firestore rules already match the app's user model.
- Reconnect behavior is built into the client: a late or reconnecting app can
  read the current active event and render the correct screen.
- No separate WebSocket server needs to be hosted for the app MVP.

Theatre-side systems may still use WebSocket or HTTP to reach the backend. That
transport stops at Firebase Functions; Firestore remains the canonical app-facing
live state.

Firestore is not intended for frame-perfect cue timing. It is appropriate for
show interactions that need to update phones within ordinary realtime latency,
such as alarm takeover, connection status, voting windows, and vote results. If
future requirements demand synchronized light effects at frame accuracy, that
will need a separate timing mechanism.

## Live Session Gate

A live event must never target every production app user. It only targets users
who have joined the current show session.

There is exactly one current live session per mode:

- `production-current`
- `dev-current`

The admin page does not manage parallel sessions. Starting a live session upserts
the current session for the selected mode and closes older active sessions in
that mode. The session keeps an internal safety expiry, but moderators do not set
start/end times in the show UI.

The only supported venue for MVP auto-check-in is Theater Altenburg Gera
(`50.9871377`, `12.4374725`) with a 50m radius. QR join remains authoritative;
GPS/time is a convenience path when location permission is available.

The authoritative join mechanism is a QR/session link shown at the theatre. The
QR code opens the app into a live session route and joins the signed-in user to
the specific session.

The QR token is stored outside the public session document in a backend-only
private document. Moderators can redisplay the same QR code while the session is
active; app users can read live session state, but not the join token.

GPS plus time is a convenience layer:

- If the user has granted location permission, the app can auto-check-in when
  the current time is inside the show window and the device is within the venue
  radius.
- GPS/time can join a user to the same live session without scanning the QR.
- GPS/time must never be required, because some users will deny location access
  or have unreliable device location.

Users who are not joined to the session do not listen to or render session
events. People outside the show are therefore isolated from the alarm takeover.

## App Behavior

The app has a hidden or QR-opened live route for session join and status.

Session status states:

- `Live verbunden`: the user is joined, the listener is active, and heartbeat is
  current.
- `Verbinde...`: the app is joining, reconnecting, or waiting for Firestore.
- `Offline`: the app cannot currently confirm the live connection.

The first event type is `terror_alert`.

When a joined user's listener receives an active `terror_alert`, the app renders
a global full-screen alarm overlay above the current tab stack. The overlay is
not tied to a dedicated tab, because the theatrical effect is that the stage
takes control of the app from wherever the user currently is.

When the event is cleared, the overlay dismisses and the user returns to the
previous app state.

## Admin and adaptor Control

The website admin surface is hidden and authenticated. It should support:

- starting or viewing the one current live session per mode,
- printing and copying the QR/session link,
- a dedicated print route for the theatre entry poster:
  `/moderation/live/print`,
- seeing connected participant counts and recent heartbeats,
- triggering `terror_alert`,
- clearing the active event,
- closing the current live session.

adaptor:ex will later call the same Firebase event endpoint used by the admin
page. The adaptor integration should provide:

- a stable source identifier, such as `adaptor`,
- a trigger action, such as `terror_alert`,
- the target session id,
- optional cue metadata from QLab or adaptor:ex.

## Ownership

- App, Firebase live API, Firestore state, and website admin trigger: Armin.
- adaptor:ex to theatre/QLab integration: Anton K.
- Final cue timing and stage output: theatre/video/stage technology team.

## MVP Boundary

The MVP includes:

- QR-gated session join,
- GPS/time auto-check-in when possible,
- live connection status and heartbeat,
- one event type: `terror_alert`,
- admin trigger and clear controls,
- adaptor-compatible backend event contract.

Voting, cube-specific logic, weighted votes, and subgroup targeting are future
extensions after the alarm flow is proven.
