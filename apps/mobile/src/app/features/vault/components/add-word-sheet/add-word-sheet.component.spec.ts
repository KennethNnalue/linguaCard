import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { MOCK_CARDS, MOCK_COLLECTIONS } from '@lingua-card/shared/testing';
import { of } from 'rxjs';

import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { AuthService } from '../../../../core/services/auth.service';
import { LanguageService } from '../../../../core/services/language.service';
import { WordAudioService } from '../../../../shared/audio/word-audio.service';
import { CardDedupService } from '../../../../shared/dedup/card-dedup.service';
import { EnrichOneApiService } from '../../import/services/enrich-one-api.service';
import { CardApiService } from '../../services/card-api.service';
import { DictionaryApiService } from '../../services/dictionary-api.service';
import { CardStore } from '../../store/card.store';
import { CollectionStore } from '../../store/collection.store';
import { AddWordSheetComponent } from './add-word-sheet.component';
import { VaultV2Store } from '../../store/vault-v2.store';

describe('AddWordSheetComponent', () => {
  let component: AddWordSheetComponent;
  let fixture: ComponentFixture<AddWordSheetComponent>;
  const updateCard = jest.fn();
  const createCard = jest.fn();
  const update = jest.fn();
  const dismiss = jest.fn();
  const loadCollections = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AddWordSheetComponent],
      providers: [
        { provide: VaultV2Store, useValue: { vault: signal(null) } },
        { provide: CollectionStore, useValue: { collections: signal(MOCK_COLLECTIONS), loadCollections } },
        { provide: WordAudioService, useValue: { play: jest.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-001' }) } },
        { provide: CardStore, useValue: { createCard, updateCard } },
        { provide: CardApiService, useValue: { update } },
        { provide: EnrichOneApiService, useValue: { enrich: jest.fn() } },
        { provide: DictionaryApiService, useValue: { lookup: jest.fn() } },
        { provide: ModalController, useValue: { create: jest.fn(), dismiss } },
        { provide: AppNotificationService, useValue: { create: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: CardDedupService, useValue: { check: jest.fn(), checkByBackOnly: jest.fn() } },
        { provide: LanguageService, useValue: { current: signal('en') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddWordSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('refills the collection and the other fields when a card is assigned for editing', () => {
    const card = MOCK_CARDS[0];

    component.cardToEdit = card;
    fixture.detectChanges();

    expect(component.form.getRawValue()).toMatchObject({
      front: card.content.front,
      back: card.content.back,
      article: card.content.article,
      collectionId: card.collectionId,
    });
    expect(component.selectedCollectionLabel()).toContain(MOCK_COLLECTIONS[1].name);
  });

  it('shows messages for all required fields after a save attempt', () => {
    component.form.patchValue({ front: '  ', back: '', collectionId: null });

    component.save();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#add-word-back-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#add-word-front-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#add-word-collection-error')).not.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the edited card with the selected collection and closes after success', () => {
    const card = MOCK_CARDS[0];
    const updatedCard = { ...card, collectionId: 'col-003' };
    update.mockReturnValue(of(updatedCard));
    component.cardToEdit = card;
    component.form.patchValue({ collectionId: updatedCard.collectionId });

    component.save();

    expect(update).toHaveBeenCalledWith(card.id, expect.objectContaining({
      collectionId: updatedCard.collectionId,
      categoryIds: card.categoryIds,
      content: expect.objectContaining({
        front: card.content.front,
        back: card.content.back,
      }),
    }));
    expect(updateCard).toHaveBeenCalledWith(updatedCard);
    expect(loadCollections).toHaveBeenCalledTimes(2);
    expect(dismiss).toHaveBeenCalledWith({ created: true, collectionId: updatedCard.collectionId });
    expect(component.saving()).toBe(false);
  });

  it('creates a valid card with trimmed values and reports its collection', () => {
    const createdCard = { ...MOCK_CARDS[0], id: 'card-created', collectionId: 'col-001' };
    createCard.mockReturnValue(of(createdCard));
    component.form.patchValue({
      front: '  the train  ',
      back: '  Zug  ',
      collectionId: createdCard.collectionId,
    });

    component.save();

    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: createdCard.collectionId,
      content: expect.objectContaining({ front: 'the train', back: 'Zug' }),
    }));
    expect(dismiss).toHaveBeenCalledWith({ created: true, collectionId: createdCard.collectionId });
    expect(component.saving()).toBe(false);
  });
});
