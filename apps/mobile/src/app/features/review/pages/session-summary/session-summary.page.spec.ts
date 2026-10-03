import { signal } from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivatedRoute, Router} from '@angular/router';
import type {ReviewSessionHistoryEntry} from '../../models/review.model';
import {ReviewStore} from '../../store/review.store';
import {SessionStatsService} from '../../shared/services/session-stats.service';
import {EngagementStore} from '../../../engagement/state/engagement.store';
import {CardStore} from '../../../vault/store/card.store';
import {ReviewFeedbackService} from '../../services/review-feedback.service';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewRoute} from '../../models/review.model';
import {SessionSummaryPage} from './session-summary.page';

describe('SessionSummaryPage', () => {
  let fixture: ComponentFixture<SessionSummaryPage>;
  const session: ReviewSessionHistoryEntry = {
    id: 'session-1',
    startedAt: '2026-09-12T08:00:00.000Z',
    completedAt: '2026-09-12T08:01:00.000Z',
    totalCards: 1,
    newCards: 0,
    ratings: {'card-1': 'hard'},
    collectionId: null,
    collectionName: null,
    originalCardIds: ['card-1'],
    reviewedCardIds: ['card-1'],
    manuallyMasteredCardIds: [],
  };
  const currentSession = signal<ReviewSessionHistoryEntry | null>(null);
  let requestedSessionId: string | null = null;
  const restoreCompletedSession = jest.fn(async (id: string) => currentSession.set({ ...session, id, continuation: { kind: 'podcast', episodeId: 'original-episode', title: 'Original conversation' } }));
  const clearSession = jest.fn();
  const navigate = jest.fn().mockResolvedValue(true);

  beforeEach(async () => {
    currentSession.set(session); requestedSessionId = null;
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SessionSummaryPage],
      providers: [
        {provide: Router, useValue: {navigate}},
        {provide: ActivatedRoute, useValue: {snapshot: {queryParamMap: {get: () => requestedSessionId}}}},
        {provide: ReviewStore, useValue: {completedSession: currentSession, clearSession, restoreCompletedSession}},
        {provide: SessionStatsService, useValue: {formatDuration: () => '1m 0s', recallRate: () => 0}},
        {
          provide: EngagementStore,
          useValue: {
            activeCelebration: () => null,
            celebrationShouldAnimate: () => false,
            prepareSessionCelebration: jest.fn(),
            dismissCelebration: jest.fn(),
          },
        },
        {provide: ReviewFeedbackService, useValue: {sessionComplete: jest.fn()}},
        {provide: CardStore, useValue: {cards: () => []}},
        {provide: ReviewPlayerService, useValue: {open: jest.fn()}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionSummaryPage);
    fixture.detectChanges();
  });

  it('restores the URL session instead of retaining a different completed session', async () => {
    requestedSessionId = 'older-session';
    await fixture.componentInstance.ngOnInit();
    expect(restoreCompletedSession).toHaveBeenCalledWith('older-session');
    expect(fixture.componentInstance.session()?.id).toBe('older-session');
    fixture.componentInstance.continueToConversation();
    expect(navigate).toHaveBeenCalledWith(['/podcasts/episodes', 'original-episode'], { queryParams: { fromReview: '1' } });
  });

  it('returns to Review home from the top close button', () => {
    const closeButton = fixture.debugElement.query(By.css('.ss-close'));

    expect(closeButton).not.toBeNull();
    closeButton.triggerEventHandler('click');

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([ReviewRoute.HUB]);
  });
});
