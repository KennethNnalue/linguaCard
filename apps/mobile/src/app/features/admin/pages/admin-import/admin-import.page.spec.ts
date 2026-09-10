import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {AlertController, provideIonicAngular} from '@ionic/angular';
import {provideTranslateService} from '@ngx-translate/core';
import type {AdminPlatformCollectionListItem} from '@lingua-card/shared/domain';
import {AppNotificationService} from '@lingua-card/mobile/notifications';
import {of} from 'rxjs';
import {AdminApiService} from '../../services/admin-api.service';
import {AdminImportPage} from './admin-import.page';

function createCollection(
  overrides: Partial<AdminPlatformCollectionListItem> = {},
): AdminPlatformCollectionListItem {
  return {
    id: 'collection-1',
    title: 'Und was machst du?',
    emoji: null,
    coverImageUrl: null,
    level: 'A2',
    topic: 'Daily life',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    status: 'ready_to_publish',
    wordCount: 82,
    dictionaryLinked: 82,
    isPublished: false,
    storyCategory: null,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('AdminImportPage collection metadata editor', () => {
  const updateCollection = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdminImportPage],
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        provideTranslateService(),
        {
          provide: AdminApiService,
          useValue: {
            updateCollection,
            uploadCollectionCover: jest.fn(),
          },
        },
        {
          provide: AppNotificationService,
          useValue: {create: jest.fn().mockResolvedValue({present: jest.fn().mockResolvedValue(undefined)})},
        },
        {provide: AlertController, useValue: {create: jest.fn()}},
      ],
    }).compileComponents();
  });

  it('retains the collection level and saves edits without a native form submission', async () => {
    const collection = createCollection();
    const updated = createCollection({title: 'Updated title', level: 'B1'});
    updateCollection.mockReturnValue(of(updated));
    const fixture = TestBed.createComponent(AdminImportPage);
    const page = fixture.componentInstance;
    page.activeTab.set('collections');
    page.collections.set([collection]);
    page.selectedCollectionId.set(collection.id);
    page.startEditingMetadata(collection);
    expect(page.metadataForm.controls.level.value).toBe('A2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.metadataForm.controls.level.value).toBe('A2');

    const form = fixture.nativeElement.querySelector('.adm-metadata-editor') as HTMLFormElement;
    const title = form.querySelector('input[formControlName="title"]') as HTMLInputElement;
    const level = form.querySelector('select[formControlName="level"]') as HTMLSelectElement;
    expect(level.selectedOptions[0].textContent).toBe('A2');

    title.value = '  Updated title  ';
    title.dispatchEvent(new Event('input'));
    level.selectedIndex = 2;
    level.dispatchEvent(new Event('change'));
    const submit = new Event('submit', {bubbles: true, cancelable: true});
    form.dispatchEvent(submit);

    expect(submit.defaultPrevented).toBe(true);
    expect(updateCollection).toHaveBeenCalledWith(collection.id, {
      title: 'Updated title',
      level: 'B1',
    });
    expect(page.collections()).toEqual([updated]);
    expect(page.editingMetadataId()).toBeNull();
  });
});
