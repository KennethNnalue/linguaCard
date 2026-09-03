import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { UserStoryProgress } from '@lingua-card/shared/domain';
import { AuthService, AuthUser } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { PlatformStoryApiService } from './platform-story-api.service';
import { PlatformStoryProgressService } from './platform-story-progress.service';

describe('PlatformStoryProgressService offline progress', () => {
  const currentUser = signal<AuthUser | null>({
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    avatarInitials: 'U',
  });
  let savedProgress: UserStoryProgress | null;
  let enqueue: jest.Mock;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    savedProgress = null;
    enqueue = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        PlatformStoryProgressService,
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: LocalDataService,
          useValue: {
            getPlatformStoryProgress: jest.fn(async () => savedProgress),
            setPlatformStoryProgress: jest.fn(async (_userId: string, progress: UserStoryProgress) => {
              savedProgress = progress;
            }),
          },
        },
        { provide: SyncService, useValue: { enqueue } },
        { provide: PlatformStoryApiService, useValue: {} },
      ],
    });
  });

  test('marks a cached platform story read locally and queues the server mutation', async () => {
    const progress = await TestBed.inject(PlatformStoryProgressService).loadAndMarkRead('story-1');

    expect(progress).toEqual(expect.objectContaining({
      storyId: 'story-1',
      userId: 'user-1',
      isRead: true,
    }));
    expect(enqueue).toHaveBeenCalledWith({
      type: 'MARK_PLATFORM_STORY_READ',
      payload: { storyId: 'story-1' },
    });
  });

  test('persists an offline quiz score and queues it for synchronization', async () => {
    const progress = await TestBed.inject(PlatformStoryProgressService).saveQuizScore('story-1', 3);

    expect(progress?.quizScore).toBe(3);
    expect(enqueue).toHaveBeenCalledWith({
      type: 'SAVE_PLATFORM_STORY_QUIZ',
      payload: { storyId: 'story-1', score: 3 },
    });
  });

  test('persists a stable platform word id and queues it for synchronization', async () => {
    const progress = await TestBed.inject(PlatformStoryProgressService)
      .addSavedWord('story-1', 'dictionary-word-1');

    expect(progress?.savedWordIds).toEqual(['dictionary-word-1']);
    expect(enqueue).toHaveBeenCalledWith({
      type: 'SAVE_PLATFORM_STORY_WORD',
      payload: { storyId: 'story-1', wordId: 'dictionary-word-1' },
    });
  });
});
