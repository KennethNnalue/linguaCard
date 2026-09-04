import {
  CardSchedulingState,
  LearningStage,
  RequestedPromptDirection,
  ReviewMode,
  ReviewSessionSource,
  ReviewSessionState,
  createReviewSession,
  isCardDue,
} from './review-domain';

export interface ReviewSessionRequest {
  source: ReviewSessionSource;
  mode: ReviewMode;
  direction: RequestedPromptDirection;
  limit: number;
}

export interface SessionBuilderPolicy {
  newCardLimit: number;
  newCardRatio: number;
}

export const DEFAULT_DAILY_NEW_CARD_LIMIT = 5;
export const DEFAULT_NEW_CARD_RATIO = 0.25;

export interface ReviewedCardIntroduction {
  cardId: string;
  reviewedAt: string;
  stageBefore: LearningStage;
}

export interface ReviewCandidate {
  cardId: string;
  collectionId: string | null;
  createdAt: Date;
  scheduling: CardSchedulingState;
}

export type CandidateSelectionResult =
  | { kind: 'selected'; cardIds: readonly string[] }
  | { kind: 'empty_library' }
  | { kind: 'nothing_eligible' }
  | { kind: 'source_matched_nothing' };

export type StartSessionResult =
  | { kind: 'started'; session: ReviewSessionState }
  | Exclude<CandidateSelectionResult, { kind: 'selected' }>
  | { kind: 'load_failed'; error: ApplicationError };

export interface ApplicationError {
  code: 'cards_unavailable' | 'scheduling_unavailable' | 'session_persistence_failed';
  message: string;
}

const stageRank: Readonly<Record<LearningStage, number>> = {
  new: 0,
  learning: 1,
  familiar: 2,
  strong: 3,
  mastered: 4,
};

export function remainingDailyNewCardLimit(
  events: readonly ReviewedCardIntroduction[],
  now: Date,
  dailyLimit: number,
  timeZone: string,
): number {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0) {
    throw new Error('Daily new-card limit must be a non-negative integer');
  }
  const today = reviewDayKey(now, timeZone);
  const introducedToday = new Set(events
    .filter(event => event.stageBefore === 'new'
      && reviewDayKey(new Date(event.reviewedAt), timeZone) === today)
    .map(event => event.cardId)).size;
  return Math.max(0, dailyLimit - introducedToday);
}

function reviewDayKey(value: Date, timeZone: string): string {
  if (!Number.isFinite(value.getTime())) throw new Error('Review timestamp must be valid');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(candidate => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function compareCardId(left: ReviewCandidate, right: ReviewCandidate): number {
  return left.cardId.localeCompare(right.cardId);
}

function compareDue(left: ReviewCandidate, right: ReviewCandidate): number {
  const dueDifference = (left.scheduling.dueAt?.getTime() ?? 0) - (right.scheduling.dueAt?.getTime() ?? 0);
  return dueDifference || compareCardId(left, right);
}

function compareCreated(left: ReviewCandidate, right: ReviewCandidate): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || compareCardId(left, right);
}

function orderNewCardsFairlyAcrossCollections(
  candidates: readonly ReviewCandidate[],
  now: Date,
): ReviewCandidate[] {
  const byCollection = new Map<string, ReviewCandidate[]>();
  for (const candidate of [...candidates].sort(compareCreated)) {
    const collectionKey = candidate.collectionId ?? '';
    const collection = byCollection.get(collectionKey) ?? [];
    collection.push(candidate);
    byCollection.set(collectionKey, collection);
  }

  const sortedCollectionKeys = [...byCollection.keys()].sort();
  const rotation = sortedCollectionKeys.length === 0
    ? 0
    : Math.floor(now.getTime() / 86_400_000) % sortedCollectionKeys.length;
  const collectionKeys = [
    ...sortedCollectionKeys.slice(rotation),
    ...sortedCollectionKeys.slice(0, rotation),
  ];
  const ordered: ReviewCandidate[] = [];
  let position = 0;
  while (ordered.length < candidates.length) {
    for (const collectionKey of collectionKeys) {
      const candidate = byCollection.get(collectionKey)?.[position];
      if (candidate) ordered.push(candidate);
    }
    position += 1;
  }
  return ordered;
}

function interleaveNewCards(
  dueCards: readonly ReviewCandidate[],
  newCards: readonly ReviewCandidate[],
): ReviewCandidate[] {
  if (newCards.length === 0) return [...dueCards];
  if (dueCards.length === 0) return [...newCards];

  const reviewBatchSize = Math.max(1, Math.ceil(dueCards.length / newCards.length));
  const ordered: ReviewCandidate[] = [];
  let dueIndex = 0;
  for (const newCard of newCards) {
    ordered.push(...dueCards.slice(dueIndex, dueIndex + reviewBatchSize), newCard);
    dueIndex += reviewBatchSize;
  }
  ordered.push(...dueCards.slice(dueIndex));
  return ordered;
}

function matchesCustom(candidate: ReviewCandidate, source: Extract<ReviewSessionSource, { kind: 'custom' }>): boolean {
  const filters = source.filters;
  if (filters.cardIds && !filters.cardIds.includes(candidate.cardId)) return false;
  if (filters.collectionIds && !filters.collectionIds.includes(candidate.collectionId ?? '')) return false;
  if (filters.stages && !filters.stages.includes(candidate.scheduling.stage)) return false;
  return filters.problemStatus === undefined || candidate.scheduling.problemStatus === filters.problemStatus;
}

function matchesSource(candidate: ReviewCandidate, source: ReviewSessionSource): boolean {
  switch (source.kind) {
    case 'daily': return true;
    case 'collection': return candidate.collectionId === source.collectionId;
    case 'explicit': return source.cardIds.includes(candidate.cardId);
    case 'new-only': return candidate.scheduling.stage === 'new';
    case 'struggling': return candidate.scheduling.problemStatus === 'leech';
    case 'custom': return matchesCustom(candidate, source);
  }
}

function eligibleForAutomaticStudy(candidate: ReviewCandidate): boolean {
  return candidate.scheduling.masterySource !== 'manual';
}

function orderSelectedCandidates(
  candidates: readonly ReviewCandidate[],
  source: ReviewSessionSource,
  now: Date,
  newCardLimit: number,
  sessionLimit: number,
): ReviewCandidate[] {
  if (source.kind === 'explicit') {
    const byId = new Map(candidates.map(candidate => [candidate.cardId, candidate]));
    return [...new Set(source.cardIds)].flatMap(cardId => {
      const candidate = byId.get(cardId);
      return candidate ? [candidate] : [];
    });
  }

  if (source.kind === 'daily' || source.kind === 'collection') {
    const due = candidates.filter(candidate => isCardDue(candidate.scheduling, now)).sort(compareDue);
    const selectedIds = new Set(due.map(candidate => candidate.cardId));
    const availableNewCards = candidates.filter(candidate =>
      candidate.scheduling.stage === 'new' && !selectedIds.has(candidate.cardId));
    const orderedNewCards = source.kind === 'daily'
      ? orderNewCardsFairlyAcrossCollections(availableNewCards, now)
      : [...availableNewCards].sort(compareCreated);
    const newCardSlots = Math.max(0, newCardLimit);
    const selectedNewCards = orderedNewCards.slice(0, newCardSlots);
    const selectedDueCards = due.slice(0, Math.max(0, sessionLimit - selectedNewCards.length));
    const selected = interleaveNewCards(selectedDueCards, selectedNewCards);
    if (source.kind !== 'daily' || selected.length >= sessionLimit) return selected;

    const selectedCardIds = new Set(selected.map(candidate => candidate.cardId));
    const retentionCards = candidates
      .filter(candidate => candidate.scheduling.stage !== 'new' && !selectedCardIds.has(candidate.cardId))
      .sort((left, right) => compareDue(left, right));
    return [...selected, ...retentionCards.slice(0, sessionLimit - selected.length)];
  }

  if (source.kind === 'new-only') return [...candidates].sort(compareCreated);
  if (source.kind === 'struggling') {
    return [...candidates].sort((left, right) =>
      right.scheduling.totalAgainCount - left.scheduling.totalAgainCount || compareCardId(left, right));
  }
  if (source.filters.cardIds) {
    const byId = new Map(candidates.map(candidate => [candidate.cardId, candidate]));
    return [...new Set(source.filters.cardIds)].flatMap(cardId => {
      const candidate = byId.get(cardId);
      return candidate ? [candidate] : [];
    });
  }
  return [...candidates].sort((left, right) =>
    stageRank[left.scheduling.stage] - stageRank[right.scheduling.stage] || compareDue(left, right));
}

export function selectSessionCandidates(
  candidates: readonly ReviewCandidate[],
  request: ReviewSessionRequest,
  policy: SessionBuilderPolicy,
  now: Date,
): CandidateSelectionResult {
  if (!Number.isInteger(request.limit) || request.limit <= 0) throw new Error('Session limit must be a positive integer');
  if (!Number.isInteger(policy.newCardLimit) || policy.newCardLimit < 0) throw new Error('New-card limit must be a non-negative integer');
  if (!Number.isFinite(policy.newCardRatio) || policy.newCardRatio < 0 || policy.newCardRatio > 1) {
    throw new Error('New-card ratio must be between zero and one');
  }
  if (candidates.length === 0) return { kind: 'empty_library' };

  const uniqueCandidates = [...new Map(candidates.map(candidate => [candidate.cardId, candidate])).values()];
  const sourceMatches = uniqueCandidates.filter(candidate => matchesSource(candidate, request.source));
  if (sourceMatches.length === 0) return { kind: 'source_matched_nothing' };

  const eligible = sourceMatches.filter(eligibleForAutomaticStudy);
  const reservedNewCardSlots = Math.min(policy.newCardLimit, Math.ceil(request.limit * policy.newCardRatio));
  const ordered = orderSelectedCandidates(
    eligible,
    request.source,
    now,
    reservedNewCardSlots,
    request.limit,
  ).slice(0, request.limit);
  if (ordered.length === 0) return { kind: 'nothing_eligible' };
  return { kind: 'selected', cardIds: ordered.map(candidate => candidate.cardId) };
}

export function buildReviewSession(
  candidates: readonly ReviewCandidate[],
  request: ReviewSessionRequest,
  policy: SessionBuilderPolicy,
  now: Date,
  sessionId: string,
): StartSessionResult {
  const selection = selectSessionCandidates(candidates, request, policy, now);
  if (selection.kind !== 'selected') return selection;
  return {
    kind: 'started',
    session: createReviewSession({
      id: sessionId,
      source: request.source,
      mode: request.mode,
      direction: request.direction,
      originalCardIds: selection.cardIds,
      startedAt: now,
    }),
  };
}
