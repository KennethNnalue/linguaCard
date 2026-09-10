import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {AdminApiService} from '../services/admin-api.service';
import {AdminCollectionAudioStore} from './admin-collection-audio.store';

describe('AdminCollectionAudioStore', () => {
  it('keeps collection audio preparation separate from collection import', () => {
    const startCollectionAudioPreparation = jest.fn().mockReturnValue(of({
      collectionId: 'collection-1',
      running: false,
      required: 2,
      ready: 2,
      pending: 0,
      failed: 0,
      generated: 0,
      reused: 2,
      status: 'ready_to_publish',
      started: false,
    }));
    TestBed.configureTestingModule({
      providers: [
        AdminCollectionAudioStore,
        {
          provide: AdminApiService,
          useValue: {
            startCollectionAudioPreparation,
            getCollectionAudioStatus: jest.fn(),
          },
        },
      ],
    });
    const store = TestBed.inject(AdminCollectionAudioStore);

    store.prepare('collection-1');

    expect(startCollectionAudioPreparation).toHaveBeenCalledWith('collection-1');
    expect(store.status()).toEqual(expect.objectContaining({
      collectionId: 'collection-1',
      ready: 2,
      status: 'ready_to_publish',
    }));
    expect(store.isPreparing()).toBe(false);
    expect(store.error()).toBeNull();
  });
});
