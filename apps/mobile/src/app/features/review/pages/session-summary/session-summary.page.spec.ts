import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Router} from '@angular/router';
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
  const clearSession = jest.fn();
  const navigate = jest.fn().mockResolvedValue(true);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionSummaryPage],
      providers: [
        {provide: Router, useValue: {navigate}},
        {provide: ReviewStore, useValue: {completedSession: () => session, clearSession}},
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

  it('returns to Review home from the top close button', () => {
    const closeButton = fixture.debugElement.query(By.css('.ss-close'));

    expect(closeButton).not.toBeNull();
    closeButton.triggerEventHandler('click');

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([ReviewRoute.HUB]);
  });
});
