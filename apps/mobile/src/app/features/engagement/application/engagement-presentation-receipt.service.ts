import { inject, Injectable } from '@angular/core';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';

@Injectable({ providedIn: 'root' })
export class EngagementPresentationReceiptService {
  private readonly repository = inject(EngagementLocalRepository);

  async claim(userId: string, receiptId: string): Promise<boolean> {
    let claimed = false;
    await this.repository.mutate(userId, state => {
      if (state.presentationReceipts.includes(receiptId)) return state;
      claimed = true;
      return { ...state, presentationReceipts: [...state.presentationReceipts, receiptId] };
    });
    return claimed;
  }
}
