# adaptor:ex Handoff: Phase 2 Live Events

This document captures the planned contract for Anton K. and the theatre-side
integration. Credentials and concrete adaptor connection details are pending.

## Expected Source Flow

```text
QLab -> adaptor:ex -> Firebase Function -> Firestore realtime -> app
```

The admin page on `mytopia.world` will call the same Firebase Function endpoint
first, so the app and backend can be tested before adaptor access is available.

## Pending Inputs From Anton K.

- adaptor online instance URL or access details.
- Authentication method or credentials for adaptor to call Firebase.
- Confirmation of whether adaptor will call HTTP directly or bridge from
  WebSocket/MQTT to HTTP.
- Crash course timing with Anton K. and Lena Biresch.
- QLab cue naming/trigger payload conventions.

## Firebase Endpoints

The adaptor can call fixed URLs without headers or JSON bodies.

```text
POST https://europe-west1-mytopia-6c440.cloudfunctions.net/narrativeApi/live/adaptor/terror-alert/start?token=<ADAPTOR_LIVE_TRIGGER_TOKEN>
POST https://europe-west1-mytopia-6c440.cloudfunctions.net/narrativeApi/live/adaptor/terror-alert/stop?token=<ADAPTOR_LIVE_TRIGGER_TOKEN>
```

`GET` is also accepted for both URLs as a fallback if adaptor cannot use `POST`.
Use `POST` where possible.

## Authentication

Admin page:

- Firebase Auth user with `admin` or `moderator` custom claim.

adaptor:ex:

- Uses `ADAPTOR_LIVE_TRIGGER_TOKEN` configured in Firebase Functions environment.
- Sends the token as a `token` query parameter because adaptor cannot set HTTP
  headers.
- The secret must not be committed to the repo or printed in public show docs.

Optional rehearsal mode:

```text
POST https://europe-west1-mytopia-6c440.cloudfunctions.net/narrativeApi/live/adaptor/terror-alert/start?mode=dev&token=<ADAPTOR_LIVE_TRIGGER_TOKEN>
POST https://europe-west1-mytopia-6c440.cloudfunctions.net/narrativeApi/live/adaptor/terror-alert/stop?mode=dev&token=<ADAPTOR_LIVE_TRIGGER_TOKEN>
```

## Start Response

```json
{
  "ok": true,
  "sessionId": "production-current",
  "eventId": "<event-id>",
  "status": "active"
}
```

Repeated start calls are idempotent. If the terror warning is already active,
the backend returns success with the existing active event id.

## Stop Response

```json
{
  "ok": true,
  "sessionId": "production-current",
  "eventId": "<event-id-or-null>",
  "status": "cleared"
}
```

Repeated stop calls are idempotent. If no terror warning is active, the backend
returns success with `eventId: null`.

## App Delivery Contract

Firebase writes the canonical event state to Firestore:

```text
v2/app/liveSessions/{sessionId}/events/{eventId}
```

Joined app users listen to the active session and render the alarm when the
latest active event has:

```json
{
  "type": "terror_alert",
  "status": "active"
}
```

When the event is cleared, the app dismisses the overlay.

## Operational Notes

- The adaptor must target the current session id, not all production users.
- Current session ids are deterministic: `production-current` for shows and
  `dev-current` for development testing.
- If an app reconnects late, Firestore state should still show whether the
  event is active or cleared.
- adaptor/QLab timing is allowed to be theatrical-cue precise on the stage side,
  but phone delivery is ordinary realtime latency, not frame-accurate sync.
