import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { MOCK_COLLECTIONS } from '@lingua-card/shared/testing';

import { CollectionStore } from '../../store/collection.store';
import { AssignCollectionSheetComponent } from './assign-collection-sheet.component';

describe('AssignCollectionSheetComponent', () => {
  let component: AssignCollectionSheetComponent;
  let fixture: ComponentFixture<AssignCollectionSheetComponent>;
  const loadCollections = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AssignCollectionSheetComponent],
      providers: [
        {
          provide: CollectionStore,
          useValue: {
            collections: signal(MOCK_COLLECTIONS),
            loadCollections,
            createCollection: jest.fn(),
          },
        },
        { provide: ModalController, useValue: { dismiss: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignCollectionSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('refreshes and initially exposes every collection', () => {
    expect(loadCollections).toHaveBeenCalledTimes(1);
    expect(component.filteredCollections()).toEqual(MOCK_COLLECTIONS);
  });

  it('searches collections by name without case sensitivity', () => {
    component.searchCtrl.setValue('FAMILY');

    expect(component.filteredCollections()).toEqual([MOCK_COLLECTIONS[1]]);
  });
});
