import {createReviewSession} from '../domain/review-domain';
import {applyCurrentReviewPreferences, ReviewPrefsService} from './review-prefs.service';

describe('applyCurrentReviewPreferences', () => {
  it('updates a resumable session mode without replacing its queue or progress', () => {
    const session = createReviewSession({
      id: 'session-1',
      source: {kind: 'daily'},
      mode: 'recall',
      direction: 'source_to_target',
      originalCardIds: ['card-1', 'card-2'],
      startedAt: new Date('2026-08-21T10:00:00.000Z'),
    });

    const updated = applyCurrentReviewPreferences(session, {
      mode: 'type',
      direction: 'de-en',
    });

    expect(updated.definition.mode).toBe('typing');
    expect(updated.definition.direction).toBe('target_to_source');
    expect(updated.definition.originalCardIds).toEqual(['card-1', 'card-2']);
    expect(updated.completedOriginalCardIds).toEqual(session.completedOriginalCardIds);
    expect(updated.reviewAttemptCount).toBe(session.reviewAttemptCount);
    expect(updated).not.toBe(session);
  });
});

describe('ReviewPrefsService', () => {
  beforeEach(() => localStorage.clear());

  it('defaults autoplay to the word and usage example', () => {
    expect(new ReviewPrefsService().autoplay()).toBe('answer_and_example');
  });

  it('keeps a saved autoplay preference', () => {
    localStorage.setItem('lc-review-autoplay', 'off');

    expect(new ReviewPrefsService().autoplay()).toBe('off');
  });
});
