import {getRepositoryToken} from '@nestjs/typeorm';
import {Test} from '@nestjs/testing';
import {CardEntity} from '../cards/card.entity';
import {CollectionEntity} from './collection.entity';
import {CollectionsService} from './collections.service';

function createCollectionEntity(): CollectionEntity {
  const entity = new CollectionEntity();
  entity.id = 'collection-1';
  entity.userId = 'user-1';
  entity.name = 'Guten tag';
  entity.description = '';
  entity.emoji = '📚';
  entity.colour = '#2D5A4E';
  entity.contextId = 'context-1';
  entity.learningContextId = 'context-1';
  entity.coverSeed = 'platform-collection-1';
  entity.coverImageUrl = 'https://cdn.example.com/guten-tag.webp';
  entity.cardCount = 0;
  entity.masteredCount = 0;
  entity.dueCount = 0;
  entity.isDefault = false;
  entity.importStatus = 'complete';
  entity.pendingWords = [];
  entity.sourceImageDescription = null;
  entity.sourcePlatformCollectionId = 'platform-collection-1';
  entity.sourcePodcastEpisodeId = null;
  entity.level = 'A1';
  entity.topic = 'Introductions';
  entity.createdAt = new Date('2026-09-10T00:00:00.000Z');
  entity.updatedAt = new Date('2026-09-10T00:00:00.000Z');
  return entity;
}

describe('CollectionsService', () => {
  it('includes persisted cover data in collection details', async () => {
    const entity = createCollectionEntity();
    const findOneBy = jest.fn().mockResolvedValue(entity);
    const query = jest.fn().mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        CollectionsService,
        {provide: getRepositoryToken(CollectionEntity), useValue: {findOneBy}},
        {provide: getRepositoryToken(CardEntity), useValue: {manager: {query}}},
      ],
    }).compile();
    const service = module.get(CollectionsService);

    const collection = await service.findOne('user-1', entity.id);

    expect(findOneBy).toHaveBeenCalledWith({id: entity.id, userId: 'user-1'});
    expect(collection).toEqual(expect.objectContaining({
      coverSeed: entity.coverSeed,
      coverImageUrl: entity.coverImageUrl,
    }));
  });
});
