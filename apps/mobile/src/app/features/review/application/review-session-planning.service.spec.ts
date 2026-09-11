import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createNewReviewSchedulingState,
  type ScheduledCard,
} from '@lingua-card/shared/domain';
import { CardStore } from '../../vault/store/card.store';
import type { ReviewSessionRequest } from '../domain/session-builder';
import { ReviewSessionBuilderService } from '../services/review-session-builder.service';
import { ReviewSessionPlanningService } from './review-session-planning.service';

const now = new Date('2026-09-11T08:00:00.000Z');
const options = { timeZone: 'Europe/Berlin' };
const request: ReviewSessionRequest = {
  source: { kind: 'daily' },
  mode: 'typing',
  direction: 'source_to_target',
  limit: 20,
};

function card(id: string, stage: 'new' | 'familiar'): ScheduledCard {
  return {
    id,
    deckId: 'deck-1',
    collectionId: null,
    userId: 'user-1',
    contextId: 'context-1',
    content: {
      front: `Front ${id}`,
      back: `Back ${id}`,
      article: null,
      gender: null,
      plural: null,
      examples: [],
      synonyms: [],
      notes: '',
      imageUrl: null,
      phonetic: null,
    },
    categoryIds: [],
    tags: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    reviewState: {
      ...createNewReviewSchedulingState(id),
      stage,
    },
  };
}

describe('ReviewSessionPlanningService', () => {
  function configure(
    cards: readonly ScheduledCard[],
    selection: { kind: 'selected'; cardIds: readonly string[] }
      | { kind: 'nothing_eligible' }
      | { kind: 'empty_library' },
  ): { service: ReviewSessionPlanningService; select: jest.Mock } {
    const select = jest.fn().mockResolvedValue(selection);
    TestBed.configureTestingModule({
      providers: [
        ReviewSessionPlanningService,
        { provide: CardStore, useValue: { cards: signal(cards) } },
        { provide: ReviewSessionBuilderService, useValue: { select } },
      ],
    });
    return { service: TestBed.inject(ReviewSessionPlanningService), select };
  }

  it('derives the displayed counts and estimate from the selected session cards', async () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, index) => card(`new-${index}`, 'new')),
      ...Array.from({ length: 10 }, (_, index) => card(`review-${index}`, 'familiar')),
    ];
    const cardIds = cards.map(candidate => candidate.id);
    const { service } = configure(cards, { kind: 'selected', cardIds });

    await expect(service.plan(request, now, options)).resolves.toEqual({
      kind: 'ready',
      plan: {
        cardIds,
        newCards: 10,
        reviewCards: 10,
        estimatedMinutes: 8,
      },
    });
  });

  it('uses the session builder as the selection and policy authority', async () => {
    const selectedCard = card('selected', 'familiar');
    const { service, select } = configure(
      [selectedCard],
      { kind: 'selected', cardIds: [selectedCard.id] },
    );

    await service.plan(request, now, options);

    expect(select).toHaveBeenCalledWith(request, now, options);
  });

  it('preserves empty and ineligible selection outcomes', async () => {
    const empty = configure([], { kind: 'empty_library' }).service;
    await expect(empty.plan(request, now, options)).resolves.toEqual({ kind: 'empty_library' });

    TestBed.resetTestingModule();
    const ineligible = configure([card('manual', 'familiar')], { kind: 'nothing_eligible' }).service;
    await expect(ineligible.plan(request, now, options)).resolves.toEqual({ kind: 'nothing_eligible' });
  });

  it('fails safely when selected cards disappear before the plan is projected', async () => {
    const { service } = configure([], { kind: 'selected', cardIds: ['missing'] });

    await expect(service.plan(request, now, options)).resolves.toEqual({
      kind: 'load_failed',
      error: {
        code: 'cards_unavailable',
        message: 'The planned review cards are no longer available.',
      },
    });
  });
});
