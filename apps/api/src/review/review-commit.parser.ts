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
    rating: 'again' | 'hard' | 'good' | 'easy';
  } & Record<string, unknown>;
  record: Record<string, unknown>;
  nextState: ReviewSchedulingState;
}

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
  const rating = stringField(event, 'rating');
  if (event['type'] !== 'ReviewCommitted' || event['schemaVersion'] !== 1) {
    throw new BadRequestException('Unsupported review event');
  }
  if (!isReviewRating(rating)) throw new BadRequestException('Invalid review rating');
  if (Number.isNaN(Date.parse(reviewedAt))) throw new BadRequestException('Invalid review timestamp');
  if (value['nextState'].cardId !== cardId) throw new BadRequestException('Review state card does not match event card');
  assertRecordMatchesEvent(value['record'], { reviewId, attemptId, cardId, sessionId, reviewedAt, rating });
  return { event: { ...event, eventId, attemptId, reviewId, cardId, sessionId, reviewedAt, rating }, record: value['record'], nextState: value['nextState'] };
}

function assertRecordMatchesEvent(
  record: Record<string, unknown>,
  event: Pick<ReviewCommitPayload['event'], 'reviewId' | 'attemptId' | 'cardId' | 'sessionId' | 'reviewedAt' | 'rating'>,
): void {
  for (const key of ['reviewId', 'attemptId', 'cardId', 'sessionId', 'reviewedAt', 'rating'] as const) {
    if (record[key] !== event[key]) throw new BadRequestException(`Review record ${key} does not match event`);
  }
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new BadRequestException(`Invalid ${key}`);
  return field;
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
