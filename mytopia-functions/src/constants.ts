export const LEGACY_USERS_COLLECTION_PATH = 'users';
export const V2_CHANNEL_THREADS_COLLECTION_PATH = 'v2/app/channelThreads';
export const NARRATIVE_STATE_COLLECTION_PATH = 'v2/app/narrativeState';
export const NARRATIVE_STATE_COLLECTION_PATH_DEV = 'v2/app/narrativeStateDev';
export const V2_NARRATIVE_REACTIONS_COLLECTION_PATH = 'v2/app/narrativeReactions';
export const V2_NARRATIVE_USER_REACTIONS_COLLECTION_PATH = 'v2/app/narrativeUserReactions';
export const V2_LEADERBOARD_COLLECTION_PATH = 'v2/app/leaderboard';
export const V2_SCORE_EVENTS_COLLECTION_PATH = 'v2/app/scoreEvents';
export const V2_SUBMISSIONS_COLLECTION_PATH = 'v2/app/submissions';
export const V2_USERS_COLLECTION_PATH = 'v2/app/users';
export const V2_FCM_REGISTRATIONS_COLLECTION_PATH = 'v2/app/fcmRegistrations';
export const SANITY_API_VERSION = 'v2025-02-19';

export const SANITY_BUNDLE_PROJECTION = `
  _id,
  script,
  "scriptActor": scriptActor->{
    "_id": _id,
    name,
    role,
    "avatarUrl": avatar.asset->url,
    "nameColor": nameColor.hex
  },
  "releaseAt": select(publishMode == "instant" => _updatedAt, releaseAt),
  pushTitle,
  pushBody,
  pushNow,
  publishMode,
  messages[]{
    messageId,
    text,
    "actor": actor->{
      "_id": _id,
      name,
      role,
      "avatarUrl": avatar.asset->url,
      "nameColor": nameColor.hex
    },
    "attachment": attachment[0]{
      _type,
      _type == "imageAttachment" => {
        "url": asset.asset->url,
        caption
      },
      _type == "audioAttachment" => {
        "url": asset.asset->url,
        "originalFilename": asset.asset->originalFilename,
        "mimeType": asset.asset->mimeType,
        "extension": asset.asset->extension,
        title
      },
      _type == "videoAttachment" => {
        "url": asset.asset->url,
        "originalFilename": asset.asset->originalFilename,
        "mimeType": asset.asset->mimeType,
        "extension": asset.asset->extension,
        title
      },
      _type == "missionAttachment" => {
        "missionId": mission._ref,
        "missionTitle": mission->title,
        "missionKind": mission->kind,
        "missionPoints": mission->points,
        "timeBonuses": mission->timeBonuses[]{
          minutesLimit,
          bonusPoints
        },
        "groupCompletionBonusPoints": *[_type == "sammelaufgabe" && active == true && references(mission._ref)][0].completionBonusPoints,
        "imageUrl": mission->image.asset->url,
        "questions": mission->quizConfig.questions[]{
          questionText,
          "options": options[]{text, isCorrect}
        },
        "feedbackCorrect": mission->feedbackCorrect,
        "feedbackIncorrect": mission->feedbackIncorrect,
        "questionsFeedback": mission->quizConfig.questions[]{
          questionText,
          feedbackCorrect,
          feedbackIncorrect
        },
        "gpsConfig": mission->gpsConfig{
          "latitude": location.lat,
          "longitude": location.lng,
          radiusMeters
        },
        title,
        excerpt
      }
    }
  }
`;

export const MISSION_LIST_PROJECTION = `
  _id,
  title,
  kind,
  points,
  "timeBonuses": timeBonuses[]{
    minutesLimit,
    bonusPoints
  },
  description,
  active,
  expiresAt,
  "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
  "groupTitle": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].title,
  "groupCompletionBonusPoints": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].completionBonusPoints,
  "imageUrl": image.asset->url,
  "gpsConfig": gpsConfig{
    "latitude": location.lat,
    "longitude": location.lng,
    radiusMeters
  },
  "questionCount": count(quizConfig.questions)
`;

export const MISSION_DETAIL_PROJECTION = `
  _id,
  title,
  kind,
  points,
  "timeBonuses": timeBonuses[]{
    minutesLimit,
    bonusPoints
  },
  description,
  active,
  expiresAt,
  "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
  "groupTitle": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].title,
  "groupCompletionBonusPoints": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].completionBonusPoints,
  "actorId": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)][0].scriptActor->_id,
  "actorName": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)][0].scriptActor->name,
  "actorRole": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)][0].scriptActor->role,
  "actorAvatarUrl": *[_type == "narrativeBundle" && !(_id in path("drafts.**")) && (publishMode == "instant" || (defined(releaseAt) && dateTime(releaseAt) <= dateTime(now()))) && references(^._id)][0].scriptActor->avatar.asset->url,
  "imageUrl": image.asset->url,
  "gpsConfig": gpsConfig{
    "latitude": location.lat,
    "longitude": location.lng,
    radiusMeters
  },
  "questions": quizConfig.questions[]{
    questionText,
    "optionCount": count(options),
    "options": options[]{text, isCorrect},
    feedbackCorrect,
    feedbackIncorrect
  },
  feedbackCorrect,
  feedbackIncorrect
`;

export const MISSION_SCORING_PROJECTION = `
  _id,
  title,
  kind,
  points,
  "timeBonuses": timeBonuses[]{
    minutesLimit,
    bonusPoints
  },
  active,
  expiresAt,
  "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
  "groupTitle": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].title,
  "groupCompletionBonusPoints": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].completionBonusPoints,
  "questions": quizConfig.questions[]{
    questionText,
    "options": options[]{text, isCorrect},
    feedbackCorrect,
    feedbackIncorrect
  },
  feedbackCorrect,
  feedbackIncorrect
`;

export const MAP_MISSION_POINT_PROJECTION = `
  "type": "mission",
  "id": _id,
  title,
  description,
  "imageUrl": image.asset->url,
  "latitude": gpsConfig.location.lat,
  "longitude": gpsConfig.location.lng,
  "radiusMeters": gpsConfig.radiusMeters,
  points
`;

export const MAP_CHECKPOINT_PROJECTION = `
  "type": "checkpoint",
  "id": _id,
  title,
  description,
  "imageUrl": image.asset->url,
  "latitude": location.lat,
  "longitude": location.lng
`;
