import type {AdoptPlatformCollectionResult, PlatformCollectionDetail} from '@lingua-card/shared/domain';
import {applyAdoptionToDetailCache} from './platform-collection.store';

describe('applyAdoptionToDetailCache', () => {
  it('keeps the visible detail populated and marks it adopted', () => {
    const detail = {
      id: 'platform-1',
      adoptionStatus: 'not-adopted',
      adoptedCollectionId: null,
      words: [{dictionaryWordId: 'word-1', knownToUser: false}],
    } as PlatformCollectionDetail;
    const result = {
      collection: {id: 'personal-1'},
      addedCount: 1,
      skippedCount: 0,
    } as AdoptPlatformCollectionResult;

    const updated = applyAdoptionToDetailCache({'platform-1': detail}, 'platform-1', result);

    expect(updated['platform-1']).toEqual(expect.objectContaining({
      adoptionStatus: 'adopted',
      adoptedCollectionId: 'personal-1',
      words: [expect.objectContaining({dictionaryWordId: 'word-1', knownToUser: true})],
    }));
  });

  it('does not invent a detail when adoption came from onboarding', () => {
    expect(applyAdoptionToDetailCache({}, 'platform-1', {
      collection: {id: 'personal-1'},
    } as AdoptPlatformCollectionResult)).toEqual({});
  });
});
