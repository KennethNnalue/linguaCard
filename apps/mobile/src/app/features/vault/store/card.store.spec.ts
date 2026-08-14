import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScheduledCard } from '@lingua-card/shared/domain';
import { MOCK_CARDS } from '@lingua-card/shared/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { CardApiService } from '../services/card-api.service';
import { ReviewLocalRepository } from '../../review/services/review-local.repository';
import { CardStore } from './card.store';

interface CardStoreTestDependencies {
  apiCards: Observable<ScheduledCard[]>;
  getCachedCards: jest.Mock<Promise<ScheduledCard[]>, [string]>;
  setCachedCards: jest.Mock<Promise<void>, [string, ScheduledCard[]]>;
}

function configureStore(dependencies: CardStoreTestDependencies): InstanceType<typeof CardStore> {
  const currentUser = signal<AuthUser | null>({
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    avatarInitials: 'U',
  });
  TestBed.configureTestingModule({
    providers: [
      CardStore,
      { provide: AuthService, useValue: { currentUser } },
      { provide: CardApiService, useValue: { getAll: jest.fn(() => dependencies.apiCards) } },
      {
        provide: LocalDataService,
        useValue: {
          getCards: dependencies.getCachedCards,
          setCards: dependencies.setCachedCards,
        },
      },
      { provide: SyncService, useValue: { enqueue: jest.fn().mockResolvedValue(undefined) } },
      { provide: ReviewLocalRepository, useValue: { schedulingStates: jest.fn().mockResolvedValue({}) } },
    ],
  });
  return TestBed.inject(CardStore);
}

describe('CardStore loading', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  test('falls back to the API when reading the cache fails', async () => {
    const card = { ...MOCK_CARDS[0] };
    const store = configureStore({
      apiCards: of([card]),
      getCachedCards: jest.fn().mockRejectedValue(new Error('cache unavailable')),
      setCachedCards: jest.fn().mockResolvedValue(undefined),
    });

    const result = await store.loadCards();

    expect(result).toEqual({
      status: 'ready',
      origin: 'api',
      isEmpty: false,
      warnings: [{ phase: 'cache_read', message: 'Unable to read cards saved on this device.' }],
    });
    expect(store.cards()).toEqual([card]);
  });

  test('keeps successful API data ready when writing the cache fails', async () => {
    const card = { ...MOCK_CARDS[0] };
    const store = configureStore({
      apiCards: of([card]),
      getCachedCards: jest.fn().mockResolvedValue([]),
      setCachedCards: jest.fn().mockRejectedValue(new Error('disk full')),
    });

    const result = await store.loadCards();

    expect(result).toMatchObject({
      status: 'ready',
      origin: 'api',
      warnings: [{ phase: 'cache_write' }],
    });
    expect(store.cards()).toEqual([card]);
  });

  test('keeps cached cards ready when the API refresh fails', async () => {
    const card = { ...MOCK_CARDS[0] };
    const store = configureStore({
      apiCards: throwError(() => new Error('network unavailable')),
      getCachedCards: jest.fn().mockResolvedValue([card]),
      setCachedCards: jest.fn().mockResolvedValue(undefined),
    });

    const result = await store.loadCards();

    expect(result).toEqual({
      status: 'ready',
      origin: 'cache',
      isEmpty: false,
      warnings: [{ phase: 'api', message: 'Unable to refresh cards from the server.' }],
    });
    expect(store.cards()).toEqual([card]);
  });

  test('does not restore cards from a load invalidated by reset', async () => {
    const apiCards = new Subject<ScheduledCard[]>();
    const store = configureStore({
      apiCards,
      getCachedCards: jest.fn().mockResolvedValue([]),
      setCachedCards: jest.fn().mockResolvedValue(undefined),
    });
    const pendingLoad = store.loadCards();

    store.reset();
    apiCards.next([{ ...MOCK_CARDS[0] }]);
    apiCards.complete();
    await pendingLoad;

    expect(store.cards()).toEqual([]);
    expect(store.loadState()).toEqual({ status: 'idle' });
  });
});
