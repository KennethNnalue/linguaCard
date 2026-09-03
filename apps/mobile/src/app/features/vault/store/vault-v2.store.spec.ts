import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CardView, VaultView } from '@lingua-card/shared/domain';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import type { CachedVaultSnapshot } from '../../../core/services/local-data.service';
import { VaultV2ApiService } from '../data-access/vault-v2-api.service';
import { VaultV2DataService } from '../services/vault-v2-data.service';
import { VaultV2Store } from './vault-v2.store';

const vault: VaultView = {
  learningContext: {
    id: 'context-1',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    isActive: true,
  },
  allWords: { itemCount: 1, dueCount: 1, masteredPercentage: 0 },
  collections: [],
  platformCollections: { availableCount: 0 },
};

const learningItem: CardView = {
  id: 'card-1',
  learningContextId: 'context-1',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  lexeme: { id: 'lexeme-1', text: 'Haus', partOfSpeech: 'noun', grammar: {}, phonetic: null },
  localization: { language: 'en', translation: 'house', definition: null },
  examples: [],
  personalNote: '',
  reviewState: {
    cardId: 'card-1',
    stage: 'new',
    problemStatus: 'normal',
    totalReviewCount: 0,
    totalAgainCount: 0,
    recentRatings: [],
    successfulReviewsSinceLastAgain: 0,
  },
  collectionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const cachedSnapshot: CachedVaultSnapshot = {
  learningContextId: 'context-1',
  vault,
  learningItems: [learningItem],
  cachedAt: '2026-01-01T00:00:00.000Z',
};

interface Dependencies {
  loadCachedSnapshot: jest.Mock<Promise<CachedVaultSnapshot | null>, []>;
  refreshSnapshot: jest.Mock<Promise<CachedVaultSnapshot>, []>;
}

function configureStore(dependencies: Dependencies): InstanceType<typeof VaultV2Store> {
  const currentUser = signal<AuthUser | null>({
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    avatarInitials: 'U',
  });
  TestBed.configureTestingModule({
    providers: [
      VaultV2Store,
      { provide: AuthService, useValue: { currentUser } },
      { provide: VaultV2ApiService, useValue: {} },
      { provide: VaultV2DataService, useValue: dependencies },
    ],
  });
  return TestBed.inject(VaultV2Store);
}

describe('VaultV2Store offline loading', () => {
  test('hydrates the complete Vault from the device without making a network request', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const dependencies: Dependencies = {
      loadCachedSnapshot: jest.fn().mockResolvedValue(cachedSnapshot),
      refreshSnapshot: jest.fn(),
    };
    const store = configureStore(dependencies);

    await store.loadActiveVault();

    expect(store.vault()).toEqual(vault);
    expect(store.learningItems()).toEqual([learningItem]);
    expect(store.hasCompleteVault()).toBe(true);
    expect(dependencies.refreshSnapshot).not.toHaveBeenCalled();
  });

  test('keeps cached content visible when an online refresh fails', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const dependencies: Dependencies = {
      loadCachedSnapshot: jest.fn().mockResolvedValue(cachedSnapshot),
      refreshSnapshot: jest.fn().mockRejectedValue(new Error('network unavailable')),
    };
    const store = configureStore(dependencies);

    await store.loadActiveVault();

    expect(store.vaultRequest()).toEqual({ status: 'success', data: vault, origin: 'cache' });
    expect(store.learningItems()).toEqual([learningItem]);
  });
});
