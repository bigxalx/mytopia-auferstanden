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

## Planned Firebase Endpoint

Base:

```text
POST https://europe-west1-<firebase-project>.cloudfunctions.net/narrativeApi/live/events
```

The exact base URL comes from the deployed Firebase Functions environment. The
route may be implemented under an existing `narrativeApi` function or a sibling
`liveApi` if that is cleaner during implementation.

## Authentication

Admin page:

- Firebase Auth user with `admin` or `moderator` custom claim.

adaptor:ex:

- Preferred: server-side shared secret or signed service credential configured
  in Firebase Functions environment.
- The secret must not be committed to the repo.
- The final header name/value will be filled in after adaptor access is known.

Placeholder:

```text
Authorization: Bearer <ADAPTOR_LIVE_TRIGGER_TOKEN>
```

## Trigger Request

Initial event type: `terror_alert`.

```json
{
  "mode": "production",
  "sessionId": "production-current",
  "type": "terror_alert",
  "source": "adaptor",
  "cueId": "qlab-cue-123",
  "payload": {
    "title": "Terrorwarnung",
    "message": "Angriff außerhalb der Kuppel bestätigt.",
    "severity": "alarm"
  }
}
```

Required fields:

- `sessionId`
- `type`
- `source`

Optional fields:

- `mode` defaults to `production`
- `cueId`
- `payload.title`
- `payload.message`
- `payload.severity`

## Trigger Response

```json
{
  "ok": true,
  "sessionId": "production-current",
  "eventId": "terror-alert-2026-08-xxT18-42-10Z",
  "status": "active"
}
```

## Clear Request

```text
POST /live/events/{eventId}/clear
```

```json
{
  "mode": "production",
  "sessionId": "production-current",
  "source": "adaptor",
  "cueId": "qlab-clear-123"
}
```

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
