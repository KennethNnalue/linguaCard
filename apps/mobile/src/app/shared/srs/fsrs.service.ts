import { Injectable } from '@angular/core';
import type { ConfidenceRating, SRSStateData } from '@lingua-card/shared/domain';
import { computeFSRS, freshFsrsState, previewFsrsIntervals } from '@lingua-card/shared/utils';

@Injectable({ providedIn: 'root' })
export class FsrsService {
  compute(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    return computeFSRS(state, rating);
  }

  previewIntervals(state: SRSStateData): Record<ConfidenceRating, number> {
    return previewFsrsIntervals(state);
  }

  freshState(cardId: string, userId: string): SRSStateData {
    return freshFsrsState(cardId, userId);
  }
}
