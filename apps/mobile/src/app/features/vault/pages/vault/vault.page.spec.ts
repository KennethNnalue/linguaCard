import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import type { CefrLevel, PlatformCollectionSummary } from '@lingua-card/shared/domain';

import { VaultPage } from './vault.page';
import { EngagementStore } from '../../../engagement/state/engagement.store';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { PlatformCollectionStore } from '../../store/platform-collection.store';
import { VaultV2Store } from '../../store/vault-v2.store';

const vaultStoreStub = {
  vault: signal(null), learningItems: signal([]), isVaultLoading: signal(false),
  isLearningItemsLoading: signal(false), loadActiveVault: jest.fn(), ensureActiveVault: jest.fn(),
};

function createPlatformCollection(index: number): PlatformCollectionSummary {
  return {
    id: `platform-${index}`,
    title: `Collection ${index}`,
    sourceLanguage: 'en',
    targetLanguage: 'de',
    coverSeed: `seed-${index}`,
    coverImageUrl: null,
    emoji: null,
    level: 'A2',
    topic: 'Everyday life',
    wordCount: 10,
    knownCount: 0,
    adoptionStatus: 'not-adopted',
    adoptedCollectionId: null,
  };
}

const platformCollections = signal(
  Array.from({ length: 15 }, (_, index) => createPlatformCollection(index)),
);
const platformStoreStub = {
  visible: platformCollections,
  selectedLevel: signal<CefrLevel | 'all'>('all'),
  isLoading: signal(false),
  hasEverLoaded: signal(true),
  loadCollections: jest.fn(),
  setLevel: jest.fn(),
  setSearch: jest.fn(),
};
const engagementStoreStub = {
  dayStreak: signal(0),
  loadEngagement: jest.fn().mockResolvedValue(undefined),
};
const cardStoreStub = { loadCards: jest.fn().mockResolvedValue(undefined), setSearch: jest.fn() };
const collectionStoreStub = { loadCollections: jest.fn() };

describe('VaultPage', () => {
  let component: VaultPage;
  let fixture: ComponentFixture<VaultPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [VaultPage],
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        provideTranslateService(),
        { provide: VaultV2Store, useValue: vaultStoreStub },
        { provide: PlatformCollectionStore, useValue: platformStoreStub },
        { provide: EngagementStore, useValue: engagementStoreStub },
        { provide: CardStore, useValue: cardStoreStub },
        { provide: CollectionStore, useValue: collectionStoreStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders every filtered Explore collection in the horizontal rail', () => {
    expect(component.exploreCards()).toHaveLength(15);
    expect(fixture.nativeElement.querySelectorAll('.rail .cover-card')).toHaveLength(15);
  });
});
