import { Injectable } from '@angular/core';
import { ConfidenceRating, SRSStateData } from '@lingua-card/shared/domain';
import { computeSM2, freshSrsState } from '@lingua-card/shared/utils';

@Injectable({ providedIn: 'root' })
export class Sm2Service {
  compute(state: SRSStateData, rating: ConfidenceRating): SRSStateData {
    return computeSM2(state, rating);
  }

  freshState(cardId: string, userId: string): SRSStateData {
    return freshSrsState(cardId, userId);
  }
}
