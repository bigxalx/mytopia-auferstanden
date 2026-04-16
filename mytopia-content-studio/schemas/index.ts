import { customAchievement } from './customAchievement';
import { mission, quizOption, quizQuestion, timeBonus } from './mission';
import { mytopiaCheckpoint } from './mytopiaCheckpoint';
import { narrativeActor } from './narrativeActor';
import {
  audioAttachment,
  imageAttachment,
  missionAttachment,
  narrativeBundle,
  narrativeMessage,
  videoAttachment,
} from './narrativeBundle';
import { sammelaufgabe } from './sammelaufgabe';
import { siteSettings } from './siteSettings';

export const schemaTypes = [
  customAchievement,
  mission,
  mytopiaCheckpoint,
  quizOption,
  quizQuestion,
  timeBonus,
  narrativeActor,
  imageAttachment,
  audioAttachment,
  videoAttachment,
  missionAttachment,
  narrativeMessage,
  narrativeBundle,
  sammelaufgabe,
  siteSettings,
];
