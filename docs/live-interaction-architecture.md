# Live Interaction Architecture

This document defines the Phase 2 live interaction architecture for the show
runtime. It is the implementation baseline for reusable live-session links,
the in-app live entry bar, realtime Firebase events, the app alarm takeover,
and the later theatre integration via QLab and adaptor:ex.

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

There is exactly one current live session per backend mode:

- `production-current`
- `dev-current`

The production app always targets `production-current`. The backend and
moderation website can still expose `dev-current` for controlled admin testing,
but app live-session discovery does not switch to dev sessions.

The admin page does not manage parallel sessions. The normal operator workflow
is based on live show windows, not manual session start/end. Moderators create a
show window, usually from one hour before the performance until the end of the
show. During that window, the backend lazily upserts the deterministic current
session and closes it automatically when the window ends.

Manual start/end controls remain available only inside an Advanced debug menu.
Manual start creates a short debug session using the same deterministic session
id and reusable QR token; it is not part of normal theatre operation.

The only supported venue for MVP GPS gating is Theater Altenburg Gera
(`50.9871377`, `12.4374725`) with a 50m radius.

The authoritative join mechanisms are:

- one reusable QR/session link shown at the theatre;
- the in-app bottom live bar shown during an active live window.

The poster QR can remain printed across performances. It opens the app into a
live session route; joining succeeds only when an active show window or debug
session exists. The bottom live bar opens the same live route as a compact
sheet, so users can join, dismiss, or re-open it while the live window is active.

The QR token is stored outside the public session document in a backend-only
private document. The token is stable by default so the poster does not need to
be reprinted for each show. App users can read live session state, but not the
join token.

GPS plus time is a visibility and join-safety layer:

- If the user has granted location permission and is outside the venue radius,
  the bottom live bar is hidden.
- If location is unavailable or denied, the app can still show the live bar and
  let the backend enforce the join rules.
- Development builds bypass GPS gating for testing and show an explicit notice
  that production will not behave that way.

Users who are not joined to the session do not listen to or render session
events. People outside the show are therefore isolated from the alarm takeover.

The MVP does not use a heartbeat. A participant becomes connected only through
an explicit join via QR/link/bottom bar, and remains connected until they
disconnect, the app marks them offline, or the live window/session closes.
`lastSeenAt` is therefore connection metadata, not a continuous liveness check.

## App Behavior

The app has a QR/universal-link/bottom-bar opened live route for session join
and status. The live route is presented as a compact bottom sheet rather than a
full-screen modal.

Session status states:

- `Live verbunden`: the user is joined and the listener is active.
- `Verbinde...`: the app is joining, reconnecting, or waiting for Firestore.
- `Noch nicht live`: the reusable QR was scanned before the next live window;
  the app shows the next possible join time, polls availability, and joins when
  the window becomes active.
- `Derzeit nicht live`: the reusable QR was scanned with no upcoming window;
  the app returns users to the normal app without a joined state.

The first event type is `terror_alert`.

When a joined user's listener receives an active `terror_alert`, the app renders
a global full-screen alarm overlay above the current tab stack. The overlay is
not tied to a dedicated tab, because the theatrical effect is that the stage
takes control of the app from wherever the user currently is.

The alarm overlay triggers device vibration immediately. The backend also sends
four rapid push notifications to connected participants. These push
notifications must use identical neutral, spoiler-free title/body text. The
in-app Firestore event payload may contain the fuller stage-facing warning copy;
the OS notification copy must not reveal story details or add sequence numbers.

When the event is cleared, the overlay dismisses and the user returns to the
previous app state.

## Admin and adaptor Control

The website admin surface is hidden and authenticated. It should support:

- creating, editing, and cancelling live show windows per mode,
- viewing the current deterministic session when a window/debug session is
  active,
- printing the reusable QR/session link even when no session is active,
- a dedicated print route for the theatre entry poster:
  `/moderation/live/print`,
- seeing connected participant counts while a session is active,
- auto-refreshing as live windows become active or end,
- triggering `terror_alert`,
- clearing the active event,
- manual start/end controls inside Advanced for debugging and emergency
  recovery.

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

- QR/universal-link session join,
- bottom-bar entry during active live windows,
- GPS/time gating when possible,
- explicit connect and disconnect,
- one event type: `terror_alert`,
- four identical spoiler-free push notifications to connected participants,
- admin trigger and clear controls,
- adaptor-compatible backend event contract.

Voting, cube-specific logic, weighted votes, and subgroup targeting are future
extensions after the alarm flow is proven.
