import { mission, quizOption, quizQuestion } from './mission';
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
  mission,
  mytopiaCheckpoint,
  quizOption,
  quizQuestion,
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
