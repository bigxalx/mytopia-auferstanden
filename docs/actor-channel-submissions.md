# Actor Channel Submissions & ActiveMissionContext

## Overview
Historically, `mytopia-functions` merged user submissions and moderation dynamically on read using `handleFeedProxy`. 

With the shift to discrete Actor Channels in Phase 1:
1. **Moderation Pipeline:** Moderation backend scripts (`writeChannelModerationUpdates` inside `submissionModerated`) strictly look for `channelId` and `actorId` inside `submission.metadata.channelMeta`. If omitted, moderation is approved silently but won't send feedback to any channel thread.
2. **Pending Messages:** Initial "Antwort gesendet" bubbles are no longer generated transparently by the backend reading a user's `/submissions` collection. Users only see immediate feedback if the frontend inserts an optimistic message into their UI and to the channel storage itself.

## Frontend Usage Rule
To properly solve both metadata transmission and immediate UI feedback natively, **never call raw repository APIs** like `submitTextMission`, `submitPhotoMission`, or `submitGpsCompletion` explicitly inside channel-rendered components (e.g. `MissionInteractionZone`). 

Instead, always consume `completeMission` from `useActiveMission()`:
```tsx
const { completeMission } = useActiveMission();

await completeMission(missionId, { text: textInput });
// Or for GPS checkins:
await completeMission(missionId, { action: 'checkin' });
```

### Why `completeMission` is Required
1. Extracts `activeChannel` from the React context tree, builds the resulting `channelMeta` object automatically, and maps it strictly to the backend.
2. Immediately builds and upserts an optimistic `#idempotent` message bubble to the user's view (preventing the "swallowed message" silent state while in `pending`).
3. Seamlessly calls the correct underlying endpoint (`submitTextMission`, `submitQuizCompletion`, etc.) gracefully applying error states and reverting the optimistic UI message if needed.

Existing code utilizing `startChatQuiz` and `submitQuizStep` internally maps out to `insertUserMessage` and `completeMission` ensuring quiz flows adhere natively to these rules.
