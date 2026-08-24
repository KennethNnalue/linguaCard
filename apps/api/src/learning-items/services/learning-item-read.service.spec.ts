import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { LearningContextEntity } from '../entities/learning-context.entity';
import type {
  CollectionSummaryRow,
  LearningItemReadRow,
} from '../models/learning-item-read.models';
import type {
  FindLearningItemsOptions,
  LearningItemReadPort,
} from '../repositories/learning-item-read.repository';
import { LearningItemReadService } from './learning-item-read.service';

function learningContext(): LearningContextEntity {
  const context = new LearningContextEntity();
  context.id = 'context-1';
  context.userId = 'user-1';
  context.sourceLanguage = 'en';
  context.targetLanguage = 'de';
  context.isActive = true;
  context.createdAt = new Date('2026-01-01T00:00:00.000Z');
  context.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return context;
}

function learningItemRow(id: string, createdAt: string): LearningItemReadRow {
  return {
    id,
    learningContextId: 'context-1',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    lexemeId: `lexeme-${id}`,
    lexemeText: 'das Haus',
    partOfSpeech: 'noun',
    grammar: { article: 'das' },
    phonetic: null,
    localizationLanguage: 'en',
    translation: 'house',
    definition: null,
    examples: [{ id: 'example-1', targetText: 'Das Haus ist groß.', sourceText: 'The house is big.' }],
    personalNote: '',
    reviewState: null,
    collectionIds: ['collection-1'],
    createdAt,
    updatedAt: createdAt,
  };
}

function collectionSummary(): CollectionSummaryRow {
  return {
    id: 'collection-1',
    learningContextId: 'context-1',
    name: 'Home',
    description: '',
    coverSeed: 'home',
    coverImageUrl: null,
    level: 'A1',
    topic: 'travel',
    itemCount: 2,
    masteredCount: 1,
    dueCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function repository(overrides: Partial<LearningItemReadPort> = {}): LearningItemReadPort {
  return {
    findLearningContext: async () => learningContext(),
    findActiveLearningContext: async () => learningContext(),
    findLearningItems: async () => [],
    loadLearningItemStats: async () => ({ itemCount: 0, dueCount: 0, masteredCount: 0 }),
    findCollectionSummaries: async () => [],
    countPublishedPlatformCollections: async () => 0,
    ...overrides,
  };
}

describe('LearningItemReadService', () => {
  it('returns directional card views with an opaque next cursor', async () => {
    const findLearningItems = jest.fn(async (options: FindLearningItemsOptions) => {
      expect(options.limit).toBe(2);
      return [
        learningItemRow('item-2', '2026-02-02T00:00:00.000Z'),
        learningItemRow('item-1', '2026-02-01T00:00:00.000Z'),
      ];
    });
    const service = new LearningItemReadService(repository({ findLearningItems }));

    const result = await service.listLearningItems({
      userId: 'user-1',
      learningContextId: 'context-1',
      limit: 1,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'item-2',
        sourceLanguage: 'en',
        targetLanguage: 'de',
        localization: expect.objectContaining({ translation: 'house' }),
        reviewState: expect.objectContaining({ cardId: 'item-2', stage: 'new' }),
      }),
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(findLearningItems).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
  });

  it('rejects malformed cursors before querying learning items', async () => {
    const findLearningItems = jest.fn(async () => []);
    const service = new LearningItemReadService(repository({ findLearningItems }));

    await expect(service.listLearningItems({
      userId: 'user-1',
      learningContextId: 'context-1',
      cursor: 'not-a-valid-cursor',
      limit: 20,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(findLearningItems).not.toHaveBeenCalled();
  });

  it('returns the Vault summary for the requested learning context', async () => {
    const service = new LearningItemReadService(repository({
      loadLearningItemStats: async () => ({ itemCount: 12, dueCount: 3, masteredCount: 6 }),
      findCollectionSummaries: async () => [collectionSummary()],
      countPublishedPlatformCollections: async () => 4,
    }));

    await expect(service.loadVault('user-1', 'context-1')).resolves.toEqual({
      learningContext: {
        id: 'context-1',
        sourceLanguage: 'en',
        targetLanguage: 'de',
        isActive: true,
      },
      allWords: { itemCount: 12, dueCount: 3, masteredPercentage: 50 },
      collections: [expect.objectContaining({ id: 'collection-1', itemCount: 2 })],
      platformCollections: { availableCount: 4 },
    });
  });

  it('does not expose a learning context owned by another user', async () => {
    const service = new LearningItemReadService(repository({
      findLearningContext: async () => null,
    }));

    await expect(service.loadVault('user-2', 'context-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
