import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { PlatformCollectionEntity } from './platform-collection.entity';
import { PlatformCollectionWordEntity } from './platform-collection-word.entity';
import { PlatformCollectionImportEntity } from './platform-collection-import.entity';
import { PlatformStoryEntity } from '../platform-stories/platform-story.entity';
import { UserStoryProgressEntity } from '../platform-stories/user-story-progress.entity';
import { WordDictionaryEntity } from '../word-dictionary/word-dictionary.entity';
import { LegacyDictionaryLexemeEntity } from '../vocabulary/entities/legacy-dictionary-lexeme.entity';
import { WordDictionaryService } from '../word-dictionary/word-dictionary.service';
import { WordAudioService } from '../word-audio/word-audio.service';
import { StoryAudioService } from '../stories/story-audio.service';
import { StorageService } from '../storage/storage.service';

jest.mock('../storage/storage.service', () => ({
  StorageService: class StorageService {},
}));

describe('AdminService story title editing', () => {
  test('updates the platform story and unchanged adopted titles in one transaction', async () => {
    const story = Object.assign(new PlatformStoryEntity(), {
      id: 'story-1', title: 'Alter Titel', titleTranslation: 'Old title',
      nativeLang: 'en', publishedAt: new Date(),
    });
    const execute = jest.fn().mockResolvedValue(undefined);
    const query = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(story),
      save: jest.fn().mockResolvedValue(story),
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const storyRepo = {
      manager: { transaction: jest.fn(async callback => callback(manager)) },
      find: jest.fn(async () => [story]),
    };
    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        ...[
          PlatformCollectionEntity, PlatformCollectionWordEntity, UserStoryProgressEntity,
          WordDictionaryEntity, PlatformCollectionImportEntity, LegacyDictionaryLexemeEntity,
        ].map(entity => ({ provide: getRepositoryToken(entity), useValue: {} })),
        { provide: getRepositoryToken(PlatformStoryEntity), useValue: storyRepo },
        ...[WordDictionaryService, WordAudioService, StoryAudioService, StorageService]
          .map(service => ({ provide: service, useValue: {} })),
      ],
    }).compile();
    const service = module.get(AdminService);

    const updated = await service.updateStoryTitles('story-1', {
      title: 'Neuer Titel', titleTranslation: 'New title',
    });

    expect(updated.title).toBe('Neuer Titel');
    expect(updated.titleTranslation).toBe('New title');
    expect(manager.save).toHaveBeenCalledWith(story);
    expect(query.set).toHaveBeenCalledWith({ title: 'Neuer Titel', titleTranslation: 'New title' });
    expect(query.where).toHaveBeenCalledWith('"source_platform_story_id" = :id', { id: 'story-1' });
    expect(query.andWhere).toHaveBeenCalledWith('title = :previousTitle', { previousTitle: 'Alter Titel' });
    expect(query.andWhere).toHaveBeenCalledWith('"titleTranslation" = :previousTranslation', { previousTranslation: 'Old title' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
