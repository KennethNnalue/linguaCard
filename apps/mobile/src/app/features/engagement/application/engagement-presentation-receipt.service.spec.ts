import { TestBed } from '@angular/core/testing';
import { EngagementLocalRepository } from '../data-access/engagement-local.repository';
import { EMPTY_ENGAGEMENT_STATE, PersistedEngagementState } from '../data-access/engagement-local.models';
import { EngagementPresentationReceiptService } from './engagement-presentation-receipt.service';

describe('EngagementPresentationReceiptService', () => {
  let state: PersistedEngagementState;
  let service: EngagementPresentationReceiptService;

  beforeEach(() => {
    state = EMPTY_ENGAGEMENT_STATE;
    const mutate: jest.MockedFunction<EngagementLocalRepository['mutate']> = jest.fn(async (_userId, update) => {
      state = update(state);
      return state;
    });
    TestBed.configureTestingModule({
      providers: [
        EngagementPresentationReceiptService,
        { provide: EngagementLocalRepository, useValue: { mutate } },
      ],
    });
    service = TestBed.inject(EngagementPresentationReceiptService);
  });

  test('claims a presentation identity only once', async () => {
    const receiptId = 'daily-goal-reached:user-1:2026-08-16';
    await expect(service.claim('user-1', receiptId)).resolves.toBe(true);
    await expect(service.claim('user-1', receiptId)).resolves.toBe(false);
    expect(state.presentationReceipts).toEqual([receiptId]);
  });
});
