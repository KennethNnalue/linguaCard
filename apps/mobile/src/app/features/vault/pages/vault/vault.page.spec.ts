import {signal, type WritableSignal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {ModalController, provideIonicAngular} from '@ionic/angular';
import {provideTranslateService} from '@ngx-translate/core';
import type {CefrLevel, PlatformCollectionSummary, VaultView} from '@lingua-card/shared/domain';
import {SyncService} from '../../../../core/services/sync.service';
import {BottomSheetService} from '../../../../shared/components/bottom-sheet/bottom-sheet.service';
import {CollectionStore} from '../../store/collection.store';
import {PlatformCollectionStore} from '../../store/platform-collection.store';
import {VaultV2Store} from '../../store/vault-v2.store';
import {VaultPage} from './vault.page';

const vault: VaultView = {
  learningContext: {
    id: 'context-1',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    isActive: true,
  },
  allWords: {itemCount: 20, dueCount: 3, masteredPercentage: 50},
  collections: [{
    id: 'collection-1',
    learningContextId: 'context-1',
    name: 'Travel',
    titleTranslation: null,
    description: '',
    coverSeed: 'travel',
    coverImageUrl: null,
    level: 'A1',
    topic: 'Travel',
    itemCount: 12,
    masteredCount: 5,
    dueCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  platformCollections: {availableCount: 2},
};

function createPlatformCollection(index: number): PlatformCollectionSummary {
  return {
    id: `platform-${index}`,
    title: `Platform collection ${index}`,
    titleTranslation: null,
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

describe('VaultPage', () => {
  let fixture: ComponentFixture<VaultPage>;
  let page: VaultPage;
  let setSearch: jest.Mock;
  let vaultSignal: WritableSignal<VaultView | null>;
  let adoptEvent: WritableSignal<{type: 'success'} | null>;

  beforeEach(async () => {
    setSearch = jest.fn();
    vaultSignal = signal<VaultView | null>(vault);
    adoptEvent = signal<{type: 'success'} | null>(null);
    const vaultStore = {
      vault: vaultSignal,
      learningItems: signal([]),
      isVaultLoading: signal(false),
      loadActiveVault: jest.fn().mockResolvedValue(undefined),
      ensureActiveVault: jest.fn(),
    };
    const platformStore = {
      visible: signal([createPlatformCollection(1), createPlatformCollection(2)]),
      selectedLevel: signal<CefrLevel | 'all'>('all'),
      isLoading: signal(false),
      hasEverLoaded: signal(true),
      loadCollections: jest.fn(),
      setLevel: jest.fn(),
      setSearch,
      lastAdoptEvent: adoptEvent,
    };

    await TestBed.configureTestingModule({
      imports: [VaultPage],
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        provideTranslateService(),
        {provide: VaultV2Store, useValue: vaultStore},
        {provide: PlatformCollectionStore, useValue: platformStore},
        {provide: CollectionStore, useValue: {loadCollections: jest.fn()}},
        {provide: SyncService, useValue: {forceSync: jest.fn().mockResolvedValue(undefined)}},
        {provide: BottomSheetService, useValue: {open: jest.fn().mockResolvedValue(undefined)}},
        {provide: ModalController, useValue: {create: jest.fn()}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows personal collections by default and switches to platform collections', () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelectorAll('.personal-card')).toHaveLength(1);
    expect(element.querySelectorAll('.platform-card')).toHaveLength(0);
    expect(element.querySelector('.vault-tabs')).not.toBeNull();

    element.querySelector('.vault-tabs')?.dispatchEvent(new CustomEvent('ionChange', {
      detail: {value: 'platform'},
    }));
    fixture.detectChanges();

    expect(element.querySelectorAll('.personal-card')).toHaveLength(0);
    expect(element.querySelectorAll('.platform-card')).toHaveLength(2);
    expect(element.querySelector('.hero')).toBeNull();
    expect(element.querySelector('.all-words')).toBeNull();
  });

  it('shows only platform collections until the first personal collection is imported', () => {
    const element: HTMLElement = fixture.nativeElement;
    vaultSignal.set({...vault, collections: []});
    fixture.detectChanges();

    expect(element.querySelector('.vault-tabs')).toBeNull();
    expect(element.querySelectorAll('.personal-card')).toHaveLength(0);
    expect(element.querySelectorAll('.platform-card')).toHaveLength(2);

    vaultSignal.set(vault);
    fixture.detectChanges();

    expect(element.querySelector('.vault-tabs')).not.toBeNull();
    expect(element.querySelectorAll('.personal-card')).toHaveLength(1);
    expect(element.querySelectorAll('.platform-card')).toHaveLength(0);
  });

  it('activates personal collections after a successful platform import', () => {
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector('.vault-tabs')?.dispatchEvent(new CustomEvent('ionChange', {
      detail: {value: 'platform'},
    }));
    fixture.detectChanges();
    expect(element.querySelectorAll('.platform-card')).toHaveLength(2);

    adoptEvent.set({type: 'success'});
    fixture.detectChanges();

    expect(element.querySelectorAll('.personal-card')).toHaveLength(1);
    expect(element.querySelectorAll('.platform-card')).toHaveLength(0);
  });

  it('renders overall mastery as a compact progress bar', () => {
    const progress = fixture.nativeElement.querySelector('ion-progress-bar') as HTMLIonProgressBarElement;

    expect(progress.value).toBe(0.5);
  });

  it('shows translated titles and filters personal collections by CEFR level', () => {
    vaultSignal.set({...vault, collections: [
      {...vault.collections[0], titleTranslation: 'Reisen'},
      {...vault.collections[0], id: 'collection-2', name: 'Work', level: 'B1'},
    ]});
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Reisen');
    expect(element.querySelectorAll('.personal-card')).toHaveLength(2);

    element.querySelector('.level-filters')?.dispatchEvent(new CustomEvent('ionChange', {detail: {value: 'B1'}}));
    fixture.detectChanges();
    expect(element.querySelectorAll('.personal-card')).toHaveLength(1);
    expect(element.querySelector('.personal-card')?.textContent).toContain('Work');
  });

  it('clears the shared collection search when the search control closes', () => {
    page.toggleSearch();
    page.collectionQuery.set('travel');
    page.toggleSearch();

    expect(page.collectionQuery()).toBe('');
    expect(setSearch).toHaveBeenLastCalledWith('');
  });
});
