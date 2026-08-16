import { BadRequestException } from '@nestjs/common';
import type { ReviewSchedulingState } from '@lingua-card/shared/domain';

export interface ReviewCommitPayload {
  event: {
    eventId: string;
    attemptId: string;
    reviewId: string;
    cardId: string;
    sessionId: string;
    reviewedAt: string;
    mode: 'typing' | 'recall';
    direction: 'source_to_target' | 'target_to_source';
    responseType: 'self_rated' | 'typed_answer' | 'dont_know';
    rating: 'again' | 'hard' | 'good' | 'easy';
    stageBefore: LearningStage;
    stageAfter: LearningStage;
    becameMastered: boolean;
    lostMastery: boolean;
    becameLeech: boolean;
    recoveredFromLeech: boolean;
    wasRelearning: boolean;
  } & Record<string, unknown>;
  record: Record<string, unknown>;
  nextState: ReviewSchedulingState;
}

type LearningStage = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';

export function parseReviewCommit(value: unknown): ReviewCommitPayload {
  if (!isRecord(value) || !isRecord(value['event']) || !isRecord(value['record']) || !isSchedulingState(value['nextState'])) {
    throw new BadRequestException('Invalid review commit');
  }
  const event = value['event'];
  const required = ['eventId', 'attemptId', 'reviewId', 'cardId', 'sessionId', 'reviewedAt'];
  if (required.some(key => typeof event[key] !== 'string' || event[key].length === 0)) {
    throw new BadRequestException('Invalid review event identifiers');
  }
  const eventId = stringField(event, 'eventId');
  const attemptId = stringField(event, 'attemptId');
  const reviewId = stringField(event, 'reviewId');
  const cardId = stringField(event, 'cardId');
  const sessionId = stringField(event, 'sessionId');
  const reviewedAt = stringField(event, 'reviewedAt');
  const mode = reviewModeField(event, 'mode');
  const direction = promptDirectionField(event, 'direction');
  const responseType = responseTypeField(event, 'responseType');
  const rating = stringField(event, 'rating');
  const stageBefore = learningStageField(event, 'stageBefore');
  const stageAfter = learningStageField(event, 'stageAfter');
  const becameMastered = booleanField(event, 'becameMastered');
  const lostMastery = booleanField(event, 'lostMastery');
  const becameLeech = booleanField(event, 'becameLeech');
  const recoveredFromLeech = booleanField(event, 'recoveredFromLeech');
  const wasRelearning = booleanField(event, 'wasRelearning');
  if (event['type'] !== 'ReviewCommitted' || event['schemaVersion'] !== 1) {
    throw new BadRequestException('Unsupported review event');
  }
  if (!isReviewRating(rating)) throw new BadRequestException('Invalid review rating');
  if (!isIsoUtcTimestamp(reviewedAt)) throw new BadRequestException('Invalid review timestamp');
  if (value['nextState'].cardId !== cardId) throw new BadRequestException('Review state card does not match event card');
  if (value['nextState'].stage !== stageAfter) throw new BadRequestException('Review state stage does not match event transition');
  assertDerivedTransition({ stageBefore, stageAfter, becameMastered, lostMastery });
  assertRecordMatchesEvent(value['record'], {
    reviewId, attemptId, cardId, sessionId, reviewedAt, mode, direction, responseType,
    rating, stageBefore, stageAfter, wasRelearning,
  });
  assertProblemTransition(value['record'], becameLeech, recoveredFromLeech);
  return {
    event: {
      ...event, eventId, attemptId, reviewId, cardId, sessionId, reviewedAt, mode, direction, responseType, rating,
      stageBefore, stageAfter, becameMastered, lostMastery, becameLeech, recoveredFromLeech, wasRelearning,
    },
    record: value['record'],
    nextState: value['nextState'],
  };
}

function assertRecordMatchesEvent(
  record: Record<string, unknown>,
  event: Pick<ReviewCommitPayload['event'],
    'reviewId' | 'attemptId' | 'cardId' | 'sessionId' | 'reviewedAt' | 'mode' | 'direction' | 'responseType'
    | 'rating' | 'stageBefore' | 'stageAfter' | 'wasRelearning'>,
): void {
  const matchingFields = [
    ['reviewId', 'reviewId'], ['attemptId', 'attemptId'], ['cardId', 'cardId'], ['sessionId', 'sessionId'],
    ['reviewedAt', 'reviewedAt'], ['reviewMode', 'mode'], ['promptDirection', 'direction'],
    ['responseType', 'responseType'], ['rating', 'rating'], ['stageBefore', 'stageBefore'],
    ['stageAfter', 'stageAfter'], ['wasRelearning', 'wasRelearning'],
  ] as const;
  for (const [recordKey, eventKey] of matchingFields) {
    if (record[recordKey] !== event[eventKey]) {
      throw new BadRequestException(`Review record ${recordKey} does not match event`);
    }
  }
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return Number.isFinite(new Date(value).getTime());
}

function reviewModeField(value: Record<string, unknown>, key: string): ReviewCommitPayload['event']['mode'] {
  const field = value[key];
  if (field === 'typing' || field === 'recall') return field;
  throw new BadRequestException(`Invalid ${key}`);
}

function promptDirectionField(value: Record<string, unknown>, key: string): ReviewCommitPayload['event']['direction'] {
  const field = value[key];
  if (field === 'source_to_target' || field === 'target_to_source') return field;
  throw new BadRequestException(`Invalid ${key}`);
}

function responseTypeField(value: Record<string, unknown>, key: string): ReviewCommitPayload['event']['responseType'] {
  const field = value[key];
  if (field === 'self_rated' || field === 'typed_answer' || field === 'dont_know') return field;
  throw new BadRequestException(`Invalid ${key}`);
}

function assertDerivedTransition(
  transition: Pick<ReviewCommitPayload['event'], 'stageBefore' | 'stageAfter' | 'becameMastered' | 'lostMastery'>,
): void {
  const becameMastered = transition.stageBefore !== 'mastered' && transition.stageAfter === 'mastered';
  const lostMastery = transition.stageBefore === 'mastered' && transition.stageAfter !== 'mastered';
  if (transition.becameMastered !== becameMastered || transition.lostMastery !== lostMastery) {
    throw new BadRequestException('Review mastery transition is inconsistent');
  }
}

function assertProblemTransition(
  record: Record<string, unknown>,
  becameLeech: boolean,
  recoveredFromLeech: boolean,
): void {
  const before = record['problemStatusBefore'];
  const after = record['problemStatusAfter'];
  if ((before !== 'normal' && before !== 'leech') || (after !== 'normal' && after !== 'leech')) {
    throw new BadRequestException('Review problem transition is invalid');
  }
  if (becameLeech !== (before === 'normal' && after === 'leech')
    || recoveredFromLeech !== (before === 'leech' && after === 'normal')) {
    throw new BadRequestException('Review problem transition is inconsistent');
  }
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new BadRequestException(`Invalid ${key}`);
  return field;
}

function booleanField(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== 'boolean') throw new BadRequestException(`Invalid ${key}`);
  return field;
}

function learningStageField(value: Record<string, unknown>, key: string): LearningStage {
  const field = value[key];
  if (field === 'new' || field === 'learning' || field === 'familiar' || field === 'strong' || field === 'mastered') {
    return field;
  }
  throw new BadRequestException(`Invalid ${key}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSchedulingState(value: unknown): value is ReviewSchedulingState {
  if (!isRecord(value)) return false;
  const stages = ['new', 'learning', 'familiar', 'strong', 'mastered'];
  const statuses = ['normal', 'leech'];
  return typeof value['cardId'] === 'string'
    && stages.includes(String(value['stage']))
    && statuses.includes(String(value['problemStatus']))
    && isMasterySource(value['masterySource'])
    && isManualMasterySnapshot(value['manualMasterySnapshot'])
    && isRelearningState(value['relearning'])
    && isOptionalPositiveInteger(value['intervalMinutes'])
    && isOptionalIsoDate(value['dueAt'])
    && isNonNegativeInteger(value['totalReviewCount'])
    && isNonNegativeInteger(value['totalAgainCount'])
    && value['totalAgainCount'] <= value['totalReviewCount']
    && Array.isArray(value['recentRatings'])
    && value['recentRatings'].length <= 10
    && value['recentRatings'].every(isReviewRating)
    && isNonNegativeInteger(value['successfulReviewsSinceLastAgain'])
    && value['successfulReviewsSinceLastAgain'] <= value['totalReviewCount']
    && hasConsistentSchedule(value);
}

function hasConsistentSchedule(value: Record<string, unknown>): boolean {
  if (value['masterySource'] === 'manual') {
    return value['stage'] === 'mastered'
      && value['intervalMinutes'] === undefined
      && value['dueAt'] === undefined
      && value['manualMasterySnapshot'] !== undefined;
  }
  if (value['totalReviewCount'] === 0) {
    return value['stage'] === 'new' && value['intervalMinutes'] === undefined && value['dueAt'] === undefined;
  }
  return value['stage'] !== 'new' && value['intervalMinutes'] !== undefined && value['dueAt'] !== undefined;
}

function isMasterySource(value: unknown): boolean {
  return value === undefined || value === 'earned' || value === 'manual';
}

function isManualMasterySnapshot(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ['new', 'learning', 'familiar', 'strong', 'mastered'].includes(String(value['previousStage']))
    && isOptionalPositiveInteger(value['previousIntervalMinutes'])
    && isOptionalIsoDate(value['previousDueAt']);
}

function isRelearningState(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ['learning', 'familiar', 'strong', 'mastered'].includes(String(value['previousStage']))
    && typeof value['previousIntervalMinutes'] === 'number'
    && Number.isInteger(value['previousIntervalMinutes'])
    && value['previousIntervalMinutes'] > 0
    && ['immediate', 'one_day', 'final'].includes(String(value['step']));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

function isOptionalIsoDate(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function isReviewRating(value: string): value is ReviewCommitPayload['event']['rating'] {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
}
