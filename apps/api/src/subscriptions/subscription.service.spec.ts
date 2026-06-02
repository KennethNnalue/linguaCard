import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionService } from './subscription.service';
import { SubscriptionEntity } from './subscription.entity';
import { StoryEntity } from '../stories/story.entity';

const mockSubRepo = () => ({
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockStoryRepo = () => ({
  countBy: jest.fn(),
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subRepo: jest.Mocked<Pick<Repository<SubscriptionEntity>, 'findOneBy' | 'create' | 'save'>>;
  let storyRepo: jest.Mocked<Pick<Repository<StoryEntity>, 'countBy'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: getRepositoryToken(SubscriptionEntity), useFactory: mockSubRepo },
        { provide: getRepositoryToken(StoryEntity), useFactory: mockStoryRepo },
      ],
    }).compile();

    service = module.get(SubscriptionService);
    subRepo = module.get(getRepositoryToken(SubscriptionEntity));
    storyRepo = module.get(getRepositoryToken(StoryEntity));
  });

  describe('getStatusForUser()', () => {
    it('returns free tier with correct stories remaining for a new user', async () => {
      const entity = { userId: 'u1', tier: 'free', expiresAt: null, activatedAt: null, createdAt: new Date(), id: 'sub1' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(1);

      const status = await service.getStatusForUser('u1');

      expect(status.tier).toBe('free');
      expect(status.isActive).toBe(false);
      expect(status.storiesGenerated).toBe(1);
      expect(status.storiesRemaining).toBe(2);
      expect(status.freeStoryLimit).toBe(3);
    });

    it('returns storiesRemaining = null for an active pro user', async () => {
      const entity = { userId: 'u2', tier: 'pro', expiresAt: null, activatedAt: new Date(), createdAt: new Date(), id: 'sub2' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(10);

      const status = await service.getStatusForUser('u2');

      expect(status.tier).toBe('pro');
      expect(status.isActive).toBe(true);
      expect(status.storiesRemaining).toBeNull();
    });

    it('returns isActive = false when expiresAt is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400_000);
      const entity = { userId: 'u3', tier: 'pro', expiresAt: pastDate, activatedAt: new Date(), createdAt: new Date(), id: 'sub3' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(0);

      const status = await service.getStatusForUser('u3');

      expect(status.isActive).toBe(false);
      expect(status.storiesRemaining).toBe(3);
    });

    it('creates a free subscription if one does not exist', async () => {
      const newEntity = { userId: 'u4', tier: 'free', expiresAt: null, activatedAt: null, createdAt: new Date(), id: 'sub4' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(null);
      subRepo.create.mockReturnValue(newEntity);
      subRepo.save.mockResolvedValue(newEntity);
      storyRepo.countBy.mockResolvedValue(0);

      const status = await service.getStatusForUser('u4');

      expect(subRepo.create).toHaveBeenCalledWith({ userId: 'u4', tier: 'free' });
      expect(status.tier).toBe('free');
    });
  });

  describe('getEffectiveTier()', () => {
    it('returns pro for active pro user', async () => {
      const entity = { userId: 'u5', tier: 'pro', expiresAt: null, activatedAt: new Date(), createdAt: new Date(), id: 'sub5' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(0);

      expect(await service.getEffectiveTier('u5')).toBe('pro');
    });

    it('returns free for expired pro user', async () => {
      const pastDate = new Date(Date.now() - 86400_000);
      const entity = { userId: 'u6', tier: 'pro', expiresAt: pastDate, activatedAt: new Date(), createdAt: new Date(), id: 'sub6' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(0);

      expect(await service.getEffectiveTier('u6')).toBe('free');
    });

    it('returns free for free user', async () => {
      const entity = { userId: 'u7', tier: 'free', expiresAt: null, activatedAt: null, createdAt: new Date(), id: 'sub7' } as SubscriptionEntity;
      subRepo.findOneBy.mockResolvedValue(entity);
      storyRepo.countBy.mockResolvedValue(0);

      expect(await service.getEffectiveTier('u7')).toBe('free');
    });
  });
});
