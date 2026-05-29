import { Injectable } from '@angular/core';
import { ConfidenceRating, MasteryLevel, SRSStateData } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class Sm2Service {
  compute(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    let { intervalDays, easeFactor, repetitions } = state;

    if (rating < 3) {
      repetitions = 0;
      intervalDays = rating === 0 ? 1 : 2;
      easeFactor = Math.max(1.3, easeFactor - (rating === 0 ? 0.2 : 0.15));
    } else {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      const easeAdjust = 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02);
      easeFactor = Math.max(1.3, easeFactor + easeAdjust);
    }

    const masteryLevel = Math.min(5, Math.floor(repetitions / 2)) as MasteryLevel;
    const nextDueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
    const srsState =
      repetitions === 0 ? 'new'
      : masteryLevel >= 4 ? 'mastered'
      : repetitions <= 2 ? 'learning'
      : 'review';

    return {
      ...state,
      intervalDays,
      easeFactor,
      repetitions,
      lastRating: rating,
      lastReviewedAt: new Date().toISOString(),
      nextDueAt,
      masteryLevel,
      state: srsState as SRSStateData['state'],
    };
  }

  freshState(cardId: string, userId: string): SRSStateData {
    return {
      id: crypto.randomUUID(),
      cardId,
      userId,
      algorithm: 'sm2',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
      lastRating: null,
      lastReviewedAt: null,
      nextDueAt: new Date().toISOString(),
      masteryLevel: 0,
      state: 'new',
    };
  }
}
