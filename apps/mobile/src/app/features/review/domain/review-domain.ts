export const MINUTES_PER_DAY = 1_440;

export type LearningStage = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';
export type ProblemStatus = 'normal' | 'leech';
export type MasterySource = 'earned' | 'manual';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewMode = 'typing' | 'recall';
export type PromptDirection = 'source_to_target' | 'target_to_source';
export type RequestedPromptDirection = PromptDirection | 'mixed';
export interface ReviewFilters {
  readonly cardIds?: readonly string[];
  readonly collectionIds?: readonly string[];
  readonly stages?: readonly LearningStage[];
  readonly problemStatus?: ProblemStatus;
}
export type ReviewSessionSource =
  | { readonly kind: 'daily' }
  | { readonly kind: 'collection'; readonly collectionId: string }
  | { readonly kind: 'explicit'; readonly cardIds: readonly string[] }
  | { readonly kind: 'new-only' }
  | { readonly kind: 'struggling' }
  | { readonly kind: 'custom'; readonly filters: ReviewFilters };
export type ReviewResponseType = 'self_rated' | 'typed_answer' | 'dont_know';
export type RelearningStep = 'immediate' | 'one_day' | 'final';
export type AnswerEvaluationResult = 'correct' | 'partially_correct' | 'incorrect';
export type AnswerIssue =
  | 'missing_article'
  | 'wrong_article'
  | 'minor_spelling_error'
  | 'wrong_plural'
  | 'wrong_word_form'
  | 'missing_diacritic';

export interface RelearningState {
  previousStage: Exclude<LearningStage, 'new'>;
  previousIntervalMinutes: number;
  step: RelearningStep;
}

export interface ManualMasterySnapshot {
  previousStage: LearningStage;
  previousIntervalMinutes?: number;
  previousDueAt?: Date;
}

export interface CardSchedulingState {
  cardId: string;
  stage: LearningStage;
  intervalMinutes?: number;
  dueAt?: Date;
  masterySource?: MasterySource;
  manualMasterySnapshot?: ManualMasterySnapshot;
  relearning?: RelearningState;
  problemStatus: ProblemStatus;
  totalReviewCount: number;
  totalAgainCount: number;
  recentRatings: ReviewRating[];
  successfulReviewsSinceLastAgain: number;
}

export interface RatingMultipliers {
  hard: number;
  good: number;
  easy: number;
}

export interface SchedulerConfig {
  newIntervals: Record<ReviewRating, number>;
  multipliers: {
    learning: RatingMultipliers;
    familiar: RatingMultipliers;
    strong: RatingMultipliers;
    mastered: RatingMultipliers;
  };
  thresholds: {
    familiarMinutes: number;
    strongMinutes: number;
    masteredMinutes: number;
  };
  relearning: {
    againMinutes: number;
    immediateHardMinutes: number;
    oneDayMinutes: number;
    finalMinutes: number;
    easyFromImmediateMinutes: number;
    recoveryMultiplier: number;
    recoveryMinimumMinutes: number;
    recoveryMaximumMinutes: number;
  };
  leech: {
    totalAgainThreshold: number;
    recentReviewWindow: number;
    recentAgainThreshold: number;
    recoverySuccesses: number;
  };
  maximumIntervalMinutes: number;
  undoManualMasteryMaximumMinutes: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  newIntervals: {
    again: 10,
    hard: 30,
    good: MINUTES_PER_DAY,
    easy: 4 * MINUTES_PER_DAY,
  },
  multipliers: {
    learning: { hard: 1.5, good: 2, easy: 3 },
    familiar: { hard: 1.2, good: 2, easy: 2.5 },
    strong: { hard: 1.2, good: 1.8, easy: 2.5 },
    mastered: { hard: 1.2, good: 2, easy: 2.5 },
  },
  thresholds: {
    familiarMinutes: 3 * MINUTES_PER_DAY,
    strongMinutes: 14 * MINUTES_PER_DAY,
    masteredMinutes: 60 * MINUTES_PER_DAY,
  },
  relearning: {
    againMinutes: 10,
    immediateHardMinutes: 30,
    oneDayMinutes: MINUTES_PER_DAY,
    finalMinutes: 3 * MINUTES_PER_DAY,
    easyFromImmediateMinutes: 3 * MINUTES_PER_DAY,
    recoveryMultiplier: 0.5,
    recoveryMinimumMinutes: 3 * MINUTES_PER_DAY,
    recoveryMaximumMinutes: 45 * MINUTES_PER_DAY,
  },
  leech: {
    totalAgainThreshold: 8,
    recentReviewWindow: 10,
    recentAgainThreshold: 3,
    recoverySuccesses: 3,
  },
  maximumIntervalMinutes: 365 * MINUTES_PER_DAY,
  undoManualMasteryMaximumMinutes: 7 * MINUTES_PER_DAY,
};

export interface AnswerEvaluation {
  result: AnswerEvaluationResult;
  issues: AnswerIssue[];
  suggestedRating: Exclude<ReviewRating, 'easy'>;
  normalizedAnswer: string;
  expectedAnswers: string[];
}

export interface AnswerEvaluationRequest {
  answer: string;
  expectedAnswers: string[];
  locale?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AnswerEvaluator {
  evaluate(request: AnswerEvaluationRequest): AnswerEvaluation;
}

export function suggestedRatingFor(result: AnswerEvaluationResult): Exclude<ReviewRating, 'easy'> {
  return result === 'correct' ? 'good' : result === 'partially_correct' ? 'hard' : 'again';
}

const cloneDate = (value: Date | undefined): Date | undefined =>
  value === undefined ? undefined : new Date(value.getTime());

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

const roundInterval = (minutes: number): number => Math.max(1, Math.round(minutes));
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function createNewSchedulingState(cardId: string): CardSchedulingState {
  return {
    cardId,
    stage: 'new',
    problemStatus: 'normal',
    totalReviewCount: 0,
    totalAgainCount: 0,
    recentRatings: [],
    successfulReviewsSinceLastAgain: 0,
  };
}

export function deriveLearningStage(
  intervalMinutes: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): Exclude<LearningStage, 'new'> {
  if (intervalMinutes >= config.thresholds.masteredMinutes) return 'mastered';
  if (intervalMinutes >= config.thresholds.strongMinutes) return 'strong';
  if (intervalMinutes >= config.thresholds.familiarMinutes) return 'familiar';
  return 'learning';
}

export const isCardDue = (state: CardSchedulingState, now: Date): boolean =>
  state.masterySource !== 'manual' && state.dueAt !== undefined && state.dueAt.getTime() <= now.getTime();

export const isCardOverdue = (state: CardSchedulingState, now: Date): boolean =>
  state.masterySource !== 'manual' && state.dueAt !== undefined && state.dueAt.getTime() < now.getTime();

export interface ScheduleResult {
  nextState: CardSchedulingState;
  previousIntervalMinutes?: number;
  nextIntervalMinutes?: number;
  dueAt?: Date;
  becameMastered: boolean;
  lostMastery: boolean;
  becameLeech: boolean;
  recoveredFromLeech: boolean;
}

function scheduleRelearning(
  state: CardSchedulingState,
  rating: ReviewRating,
  reviewedAt: Date,
  config: SchedulerConfig,
): Pick<CardSchedulingState, 'stage' | 'intervalMinutes' | 'dueAt' | 'relearning' | 'masterySource'> {
  const relearning = state.relearning;
  if (!relearning) throw new Error('Relearning state is required');
  const r = config.relearning;
  if (rating === 'again') {
    return { stage: state.stage, intervalMinutes: r.againMinutes, dueAt: addMinutes(reviewedAt, r.againMinutes), relearning: { ...relearning, step: 'immediate' }, masterySource: undefined };
  }
  if (relearning.step === 'immediate') {
    if (rating === 'hard') return { stage: state.stage, intervalMinutes: r.immediateHardMinutes, dueAt: addMinutes(reviewedAt, r.immediateHardMinutes), relearning, masterySource: undefined };
    const minutes = rating === 'good' ? r.oneDayMinutes : r.easyFromImmediateMinutes;
    const step: RelearningStep = rating === 'good' ? 'one_day' : 'final';
    return { stage: state.stage, intervalMinutes: minutes, dueAt: addMinutes(reviewedAt, minutes), relearning: { ...relearning, step }, masterySource: undefined };
  }
  if (relearning.step === 'one_day') {
    if (rating === 'hard') return { stage: state.stage, intervalMinutes: r.oneDayMinutes, dueAt: addMinutes(reviewedAt, r.oneDayMinutes), relearning, masterySource: undefined };
    const minutes = r.finalMinutes;
    return { stage: state.stage, intervalMinutes: minutes, dueAt: addMinutes(reviewedAt, minutes), relearning: { ...relearning, step: 'final' }, masterySource: undefined };
  }
  if (rating === 'hard') {
    return { stage: state.stage, intervalMinutes: r.finalMinutes, dueAt: addMinutes(reviewedAt, r.finalMinutes), relearning, masterySource: undefined };
  }
  const recovered = roundInterval(clamp(relearning.previousIntervalMinutes * r.recoveryMultiplier, r.recoveryMinimumMinutes, r.recoveryMaximumMinutes));
  return { stage: deriveLearningStage(recovered, config), intervalMinutes: recovered, dueAt: addMinutes(reviewedAt, recovered), relearning: undefined, masterySource: undefined };
}

export function scheduleReview(
  state: CardSchedulingState,
  rating: ReviewRating,
  reviewedAt: Date,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): ScheduleResult {
  if (state.masterySource === 'manual') throw new Error('Manually mastered cards cannot be reviewed');
  const beforeStage = state.stage;
  const beforeProblem = state.problemStatus;
  let scheduled: Pick<CardSchedulingState, 'stage' | 'intervalMinutes' | 'dueAt' | 'relearning' | 'masterySource'>;

  if (state.relearning) {
    scheduled = scheduleRelearning(state, rating, reviewedAt, config);
  } else if (rating === 'again' && state.stage !== 'new' && state.stage !== 'learning') {
    const previousIntervalMinutes = state.intervalMinutes ?? config.newIntervals.good;
    scheduled = {
      stage: state.stage,
      intervalMinutes: config.relearning.againMinutes,
      dueAt: addMinutes(reviewedAt, config.relearning.againMinutes),
      masterySource: undefined,
      relearning: { previousStage: state.stage, previousIntervalMinutes, step: 'immediate' },
    };
  } else if (state.stage === 'new') {
    const intervalMinutes = config.newIntervals[rating];
    scheduled = {
      stage: rating === 'easy' ? 'familiar' : 'learning',
      intervalMinutes,
      dueAt: addMinutes(reviewedAt, intervalMinutes),
      masterySource: undefined,
      relearning: undefined,
    };
  } else if (rating === 'again') {
    const intervalMinutes = config.newIntervals.again;
    scheduled = { stage: 'learning', intervalMinutes, dueAt: addMinutes(reviewedAt, intervalMinutes), masterySource: undefined, relearning: undefined };
  } else {
    const base = state.intervalMinutes ?? config.newIntervals.good;
    const multipliers = state.stage === 'learning'
      ? config.multipliers.learning
      : state.stage === 'familiar'
        ? config.multipliers.familiar
        : state.stage === 'strong'
          ? config.multipliers.strong
          : config.multipliers.mastered;
    const intervalMinutes = Math.min(config.maximumIntervalMinutes, roundInterval(base * multipliers[rating]));
    const stage = state.stage === 'mastered' ? 'mastered' : deriveLearningStage(intervalMinutes, config);
    scheduled = { stage, intervalMinutes, dueAt: addMinutes(reviewedAt, intervalMinutes), masterySource: stage === 'mastered' ? 'earned' : undefined, relearning: undefined };
  }

  const recentRatings = [...state.recentRatings, rating].slice(-config.leech.recentReviewWindow);
  const totalAgainCount = state.totalAgainCount + (rating === 'again' ? 1 : 0);
  const successStreak = rating === 'again' ? 0 : state.successfulReviewsSinceLastAgain + 1;
  const recentAgainCount = recentRatings.filter(value => value === 'again').length;
  let problemStatus = state.problemStatus;
  if (problemStatus === 'normal' && totalAgainCount >= config.leech.totalAgainThreshold && recentAgainCount >= config.leech.recentAgainThreshold) problemStatus = 'leech';
  else if (problemStatus === 'leech' && successStreak >= config.leech.recoverySuccesses) problemStatus = 'normal';

  const nextState: CardSchedulingState = {
    ...state,
    ...scheduled,
    manualMasterySnapshot: undefined,
    problemStatus,
    totalReviewCount: state.totalReviewCount + 1,
    totalAgainCount,
    recentRatings,
    successfulReviewsSinceLastAgain: successStreak,
  };
  return {
    nextState,
    previousIntervalMinutes: state.intervalMinutes,
    nextIntervalMinutes: nextState.intervalMinutes,
    dueAt: cloneDate(nextState.dueAt),
    becameMastered: beforeStage !== 'mastered' && nextState.stage === 'mastered',
    lostMastery: beforeStage === 'mastered' && nextState.masterySource !== 'earned',
    becameLeech: beforeProblem !== 'leech' && problemStatus === 'leech',
    recoveredFromLeech: beforeProblem === 'leech' && problemStatus === 'normal',
  };
}

export type RatingPreviews = Record<ReviewRating, ScheduleResult>;
export function previewRatings(state: CardSchedulingState, reviewedAt: Date, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): RatingPreviews {
  return {
    again: scheduleReview(state, 'again', reviewedAt, config),
    hard: scheduleReview(state, 'hard', reviewedAt, config),
    good: scheduleReview(state, 'good', reviewedAt, config),
    easy: scheduleReview(state, 'easy', reviewedAt, config),
  };
}

export function markAsMastered(state: CardSchedulingState): CardSchedulingState {
  if (state.masterySource === 'manual') return state;
  return {
    ...state,
    stage: 'mastered',
    intervalMinutes: undefined,
    dueAt: undefined,
    relearning: undefined,
    masterySource: 'manual',
    manualMasterySnapshot: {
      previousStage: state.stage,
      previousIntervalMinutes: state.intervalMinutes,
      previousDueAt: cloneDate(state.dueAt),
    },
  };
}

export function undoManualMastery(state: CardSchedulingState, now: Date, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): CardSchedulingState {
  if (state.masterySource !== 'manual' || !state.manualMasterySnapshot) throw new Error('Card is not manually mastered');
  const snapshot = state.manualMasterySnapshot;
  if (snapshot.previousStage === 'new' || snapshot.previousIntervalMinutes === undefined) {
    return { ...state, stage: 'new', intervalMinutes: undefined, dueAt: undefined, masterySource: undefined, manualMasterySnapshot: undefined };
  }
  const intervalMinutes = Math.min(snapshot.previousIntervalMinutes, config.undoManualMasteryMaximumMinutes);
  return {
    ...state,
    stage: deriveLearningStage(intervalMinutes, config),
    intervalMinutes,
    dueAt: addMinutes(now, intervalMinutes),
    masterySource: undefined,
    manualMasterySnapshot: undefined,
  };
}

export interface ReviewRecord {
  reviewId: string;
  attemptId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  reviewMode: ReviewMode;
  promptDirection: PromptDirection;
  responseType: ReviewResponseType;
  rating: ReviewRating;
  answerEvaluation?: AnswerEvaluation;
  stageBefore: LearningStage;
  stageAfter: LearningStage;
  problemStatusBefore: ProblemStatus;
  problemStatusAfter: ProblemStatus;
  intervalBeforeMinutes?: number;
  intervalAfterMinutes?: number;
  wasRelearning: boolean;
}

export interface ReviewCommittedEvent {
  type: 'ReviewCommitted';
  schemaVersion: 1;
  eventId: string;
  reviewId: string;
  attemptId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  mode: ReviewMode;
  direction: PromptDirection;
  responseType: ReviewResponseType;
  rating: ReviewRating;
  stageBefore: LearningStage;
  stageAfter: LearningStage;
  intervalBeforeMinutes?: number;
  intervalAfterMinutes?: number;
  becameMastered: boolean;
  lostMastery: boolean;
  becameLeech: boolean;
  recoveredFromLeech: boolean;
  wasRelearning: boolean;
}

export interface CommitReviewCommand {
  reviewId: string;
  eventId: string;
  attemptId: string;
  sessionId: string;
  reviewedAt: Date;
  reviewMode: ReviewMode;
  promptDirection: PromptDirection;
  responseType: ReviewResponseType;
  rating: ReviewRating;
  answerEvaluation?: AnswerEvaluation;
}

export interface CommitReviewResult {
  schedule: ScheduleResult;
  record: ReviewRecord;
  event: ReviewCommittedEvent;
}

export function commitReview(state: CardSchedulingState, command: CommitReviewCommand, config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG): CommitReviewResult {
  if (command.reviewMode === 'recall' && command.responseType !== 'self_rated') throw new Error('Recall mode must be self-rated');
  if (command.responseType === 'typed_answer' && !command.answerEvaluation) throw new Error('Typed answers require an evaluation');
  if (command.responseType === 'dont_know' && command.rating !== 'again') throw new Error("I don't know must commit Again");
  const wasRelearning = state.relearning !== undefined;
  const schedule = scheduleReview(state, command.rating, command.reviewedAt, config);
  const record: ReviewRecord = {
    reviewId: command.reviewId, attemptId: command.attemptId, cardId: state.cardId, sessionId: command.sessionId,
    reviewedAt: new Date(command.reviewedAt.getTime()), reviewMode: command.reviewMode, promptDirection: command.promptDirection,
    responseType: command.responseType, rating: command.rating, answerEvaluation: command.answerEvaluation,
    stageBefore: state.stage, stageAfter: schedule.nextState.stage,
    problemStatusBefore: state.problemStatus, problemStatusAfter: schedule.nextState.problemStatus,
    intervalBeforeMinutes: state.intervalMinutes, intervalAfterMinutes: schedule.nextState.intervalMinutes, wasRelearning,
  };
  const event: ReviewCommittedEvent = {
    type: 'ReviewCommitted', schemaVersion: 1, eventId: command.eventId, reviewId: command.reviewId,
    attemptId: command.attemptId, cardId: state.cardId, sessionId: command.sessionId,
    reviewedAt: new Date(command.reviewedAt.getTime()), mode: command.reviewMode, direction: command.promptDirection,
    responseType: command.responseType, rating: command.rating,
    stageBefore: state.stage, stageAfter: schedule.nextState.stage,
    intervalBeforeMinutes: state.intervalMinutes, intervalAfterMinutes: schedule.nextState.intervalMinutes,
    becameMastered: schedule.becameMastered, lostMastery: schedule.lostMastery,
    becameLeech: schedule.becameLeech, recoveredFromLeech: schedule.recoveredFromLeech, wasRelearning,
  };
  return { schedule, record, event };
}

export type ReviewSessionStatus = 'active' | 'completed';
export type PresentationKind = 'original' | 'relearning';
export interface ReviewSessionDefinition {
  id: string;
  source: ReviewSessionSource;
  mode: ReviewMode;
  direction: RequestedPromptDirection;
  originalCardIds: readonly string[];
  startedAt: Date;
}
export interface ReviewSessionState {
  definition: ReviewSessionDefinition;
  status: ReviewSessionStatus;
  currentCardId?: string;
  currentDirection?: PromptDirection;
  completedOriginalCardIds: readonly string[];
  sessionSkippedCardIds: readonly string[];
  skipCounts: Readonly<Record<string, number>>;
  lastPresentedCardId?: string;
  lastPresentationKind?: PresentationKind;
  reviewAttemptCount: number;
  completedAt?: Date;
}
export interface SessionSelection {
  kind: 'present';
  cardId: string;
  presentationKind: PresentationKind;
}
export interface ReviewPresentation {
  cardId: string;
  kind: PresentationKind;
  direction: PromptDirection;
}
export interface SessionCompletion { kind: 'complete'; state: ReviewSessionState }

export function createReviewSession(definition: ReviewSessionDefinition): ReviewSessionState {
  if (new Set(definition.originalCardIds).size !== definition.originalCardIds.length) throw new Error('Original card IDs must be unique');
  return { definition: { ...definition, originalCardIds: [...definition.originalCardIds], startedAt: new Date(definition.startedAt.getTime()) }, status: 'active', completedOriginalCardIds: [], sessionSkippedCardIds: [], skipCounts: {}, reviewAttemptCount: 0 };
}

export function resolvePresentation(
  session: ReviewSessionState,
  selection: SessionSelection,
): ReviewPresentation {
  if (session.currentCardId !== selection.cardId || session.currentDirection === undefined) {
    throw new Error('Presentation must be recorded before it can be resolved');
  }
  return { cardId: selection.cardId, kind: selection.presentationKind, direction: session.currentDirection };
}

function resolvePromptDirection(session: ReviewSessionState, cardId: string): PromptDirection {
  const requestedDirection = session.definition.direction;
  if (requestedDirection !== 'mixed') return requestedDirection;
  return session.definition.originalCardIds.indexOf(cardId) % 2 === 0
    ? 'source_to_target'
    : 'target_to_source';
}

const unresolvedOriginals = (session: ReviewSessionState): string[] => session.definition.originalCardIds.filter(id => !session.completedOriginalCardIds.includes(id) && !session.sessionSkippedCardIds.includes(id));
const nextUnresolvedOriginal = (session: ReviewSessionState): string | undefined => {
  const unresolved = unresolvedOriginals(session);
  if (!session.lastPresentedCardId) return unresolved[0];
  const lastIndex = session.definition.originalCardIds.indexOf(session.lastPresentedCardId);
  return session.definition.originalCardIds.slice(lastIndex + 1).find(id => unresolved.includes(id)) ?? unresolved[0];
};
const dueRelearning = (session: ReviewSessionState, cards: ReadonlyMap<string, CardSchedulingState>, now: Date): string[] =>
  session.definition.originalCardIds.filter(id => {
    const card = cards.get(id);
    return !session.sessionSkippedCardIds.includes(id) && card?.relearning !== undefined && isCardDue(card, now);
  });

export function selectNextCard(session: ReviewSessionState, cards: ReadonlyMap<string, CardSchedulingState>, now: Date): SessionSelection | SessionCompletion {
  if (session.status === 'completed') return { kind: 'complete', state: session };
  if (session.currentCardId && session.lastPresentationKind) {
    return {
      kind: 'present',
      cardId: session.currentCardId,
      presentationKind: session.lastPresentationKind,
    };
  }
  const relearning = dueRelearning(session, cards, now);
  const original = nextUnresolvedOriginal(session);
  const canInterleave = session.lastPresentationKind !== 'relearning';
  const relearningCardId = canInterleave ? relearning[0] : undefined;
  if (relearningCardId) return { kind: 'present', cardId: relearningCardId, presentationKind: 'relearning' };
  if (original) return { kind: 'present', cardId: original, presentationKind: 'original' };
  if (relearning[0]) return { kind: 'present', cardId: relearning[0], presentationKind: 'relearning' };
  return {
    kind: 'complete',
    state: {
      ...session,
      status: 'completed',
      currentCardId: undefined,
      currentDirection: undefined,
      completedAt: cloneDate(now),
    },
  };
}

export function recordPresentation(session: ReviewSessionState, selection: SessionSelection): ReviewSessionState {
  if (session.status !== 'active') throw new Error('Completed sessions are immutable');
  if (!session.definition.originalCardIds.includes(selection.cardId)) throw new Error('Presentation card must belong to the session');
  return {
    ...session,
    currentCardId: selection.cardId,
    currentDirection: resolvePromptDirection(session, selection.cardId),
    lastPresentedCardId: selection.cardId,
    lastPresentationKind: selection.presentationKind,
  };
}

function assertCurrentPresentation(
  session: ReviewSessionState,
  cardId: string,
  presentationKind: PresentationKind,
): void {
  if (session.currentCardId !== cardId || session.lastPresentationKind !== presentationKind) {
    throw new Error('Operation must target the current presentation');
  }
}

export function recordSessionReview(session: ReviewSessionState, cardId: string, presentationKind: PresentationKind): ReviewSessionState {
  if (session.status !== 'active') throw new Error('Completed sessions are immutable');
  assertCurrentPresentation(session, cardId, presentationKind);
  const completed = presentationKind === 'original' && !session.completedOriginalCardIds.includes(cardId)
    ? [...session.completedOriginalCardIds, cardId] : [...session.completedOriginalCardIds];
  return {
    ...session,
    currentCardId: undefined,
    currentDirection: undefined,
    completedOriginalCardIds: completed,
    reviewAttemptCount: session.reviewAttemptCount + 1,
  };
}

export function skipSessionCard(session: ReviewSessionState, cardId: string, presentationKind: PresentationKind): ReviewSessionState {
  if (session.status !== 'active') throw new Error('Completed sessions are immutable');
  assertCurrentPresentation(session, cardId, presentationKind);
  const count = (session.skipCounts[cardId] ?? 0) + 1;
  const exclude = presentationKind === 'relearning' || count >= 2;
  return {
    ...session,
    currentCardId: undefined,
    currentDirection: undefined,
    lastPresentedCardId: cardId,
    lastPresentationKind: presentationKind,
    skipCounts: { ...session.skipCounts, [cardId]: count },
    sessionSkippedCardIds: exclude && !session.sessionSkippedCardIds.includes(cardId) ? [...session.sessionSkippedCardIds, cardId] : session.sessionSkippedCardIds,
  };
}

export interface DailyProgress {
  dateKey: string;
  committedReviews: number;
  uniqueCardsReviewed: number;
  cardIds: readonly string[];
  processedEventIds: readonly string[];
}
export function projectDailyProgress(current: DailyProgress | undefined, event: ReviewCommittedEvent, dateKey: string): DailyProgress {
  const base = current?.dateKey === dateKey
    ? current
    : { dateKey, committedReviews: 0, uniqueCardsReviewed: 0, cardIds: [], processedEventIds: [] };
  if (base.processedEventIds.includes(event.eventId)) return base;
  const isNewCard = !base.cardIds.includes(event.cardId);
  return {
    dateKey,
    committedReviews: base.committedReviews + 1,
    uniqueCardsReviewed: base.uniqueCardsReviewed + (isNewCard ? 1 : 0),
    cardIds: isNewCard ? [...base.cardIds, event.cardId] : base.cardIds,
    processedEventIds: [...base.processedEventIds, event.eventId],
  };
}
