import { mission, quizOption, quizQuestion } from './mission';
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

export const schemaTypes = [
  mission,
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
];
