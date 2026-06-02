import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { StoryGenerationService } from './story-generation.service';
import { StoryEntity } from './story.entity';
import { CardEntity } from '../cards/card.entity';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { AnthropicAdapter } from '../ai/providers/anthropic.adapter';
import { GeminiAdapter } from '../ai/providers/gemini.adapter';
import { OpenRouterAdapter } from '../ai/providers/openrouter.adapter';
import { StoryPromptBuilder } from './story-prompt.builder';
import { StoryAudioService } from './story-audio.service';
import { StoryVocabMapper } from './story-vocab.mapper';
import type { GenerateStoryDto, SubscriptionStatus } from '@lingua-card/shared/domain';

const makeStatus = (overrides: Partial<SubscriptionStatus> = {}): SubscriptionStatus => ({
  tier: 'free',
  isActive: false,
  storiesGenerated: 0,
  storiesRemaining: 3,
  freeStoryLimit: 3,
  ...overrides,
});

describe('StoryGenerationService — tier routing', () => {
  let service: StoryGenerationService;
  let subscriptions: jest.Mocked<Pick<SubscriptionService, 'getStatusForUser' | 'getEffectiveTier'>>;
  let cardRepo: { find: jest.Mock };
  let storyRepo: { create: jest.Mock; save: jest.Mock; countBy: jest.Mock; findOneBy: jest.Mock };
  let openRouter: { generateText: jest.Mock };

  const mockGenerateText = jest.fn().mockResolvedValue({ text: JSON.stringify({
    title: 'Test', titleTranslation: 'Test', sentences: [],
  }), model: 'test-model', inputTokens: 10, outputTokens: 50 });

  const mockCard = { id: 'c1', userId: 'u1', collectionId: 'col1', content: { front: 'cat', back: 'Katze', article: 'die' } } as unknown as CardEntity;

  beforeEach(async () => {
    openRouter = { generateText: mockGenerateText };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoryGenerationService,
        { provide: getRepositoryToken(CardEntity), useValue: { find: jest.fn().mockResolvedValue([mockCard]) } },
        { provide: getRepositoryToken(StoryEntity), useValue: { create: jest.fn().mockReturnValue({}), save: jest.fn().mockResolvedValue({ id: 's1', sentences: [], vocabWords: [], quizQuestions: [], grammarNotes: [], keywords: [], generatedAt: new Date() }), countBy: jest.fn(), findOneBy: jest.fn() } },
        { provide: SubscriptionService, useValue: { getStatusForUser: jest.fn(), getEffectiveTier: jest.fn() } },
        { provide: AnthropicAdapter, useValue: { generateText: jest.fn() } },
        { provide: GeminiAdapter, useValue: { generateText: jest.fn() } },
        { provide: OpenRouterAdapter, useValue: openRouter },
        { provide: StoryPromptBuilder, useValue: { build: jest.fn().mockReturnValue('prompt'), buildQuizPrompt: jest.fn().mockReturnValue('q'), buildGrammarPrompt: jest.fn().mockReturnValue('g'), buildKeywordsPrompt: jest.fn().mockReturnValue('k') } },
        { provide: StoryAudioService, useValue: { generateAudioWithTimestamps: jest.fn().mockResolvedValue({ audioUrl: 'url', timestamps: [], durationMs: 1000 }) } },
        { provide: StoryVocabMapper, useValue: { markVocabWords: jest.fn().mockReturnValue([]) } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({ storyModelPro: 'claude-sonnet', storyModelFree: 'gemini-flash', defaultProvider: 'gemini' }) } },
      ],
    }).compile();

    service = module.get(StoryGenerationService);
    subscriptions = module.get(SubscriptionService);
    cardRepo = module.get(getRepositoryToken(CardEntity));
    storyRepo = module.get(getRepositoryToken(StoryEntity));
  });

  const dto: GenerateStoryDto = { collectionIds: ['col1'], length: 'short', difficulty: 'A2' };

  it('uses claude-sonnet model for pro users', async () => {
    (subscriptions.getStatusForUser as jest.Mock).mockResolvedValue(makeStatus({ tier: 'pro', isActive: true, storiesRemaining: null }));

    await service.generateAndSave('u1', dto);

    expect(openRouter.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet' }),
    );
  });

  it('uses gemini-flash model for free users', async () => {
    (subscriptions.getStatusForUser as jest.Mock).mockResolvedValue(makeStatus({ tier: 'free', isActive: false, storiesRemaining: 2 }));

    await service.generateAndSave('u1', dto);

    expect(openRouter.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-flash' }),
    );
  });

  it('throws ForbiddenException when free user has 0 stories remaining', async () => {
    (subscriptions.getStatusForUser as jest.Mock).mockResolvedValue(makeStatus({ storiesRemaining: 0 }));

    await expect(service.generateAndSave('u1', dto)).rejects.toThrow(ForbiddenException);
  });

  it('allows free user with 2 of 3 stories used to generate', async () => {
    (subscriptions.getStatusForUser as jest.Mock).mockResolvedValue(makeStatus({ storiesGenerated: 2, storiesRemaining: 1 }));

    await expect(service.generateAndSave('u1', dto)).resolves.toBeDefined();
  });
});
