export const LEGACY_USERS_COLLECTION_PATH = 'users';
export const NARRATIVE_STATE_COLLECTION_PATH = 'v2/app/narrativeState';
export const NARRATIVE_STATE_COLLECTION_PATH_DEV = 'v2/app/narrativeStateDev';
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
        "imageUrl": mission->image.asset->url,
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
  description,
  active,
  expiresAt,
  "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
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
  description,
  active,
  expiresAt,
  "groupId": *[_type == "sammelaufgabe" && active == true && references(^._id)][0]._id,
  "groupTitle": *[_type == "sammelaufgabe" && active == true && references(^._id)][0].title,
  "imageUrl": image.asset->url,
  "gpsConfig": gpsConfig{
    "latitude": location.lat,
    "longitude": location.lng,
    radiusMeters
  },
  "questions": quizConfig.questions[]{
    questionText,
    "optionCount": count(options),
    "options": options[].text
  }
`;

export const MISSION_SCORING_PROJECTION = `
  _id,
  title,
  kind,
  points,
  active,
  expiresAt,
  "questions": quizConfig.questions[]{
    questionText,
    "options": options[]{text, isCorrect}
  }
`;
