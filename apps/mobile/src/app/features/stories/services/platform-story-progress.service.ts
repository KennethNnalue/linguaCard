import { inject, Injectable } from '@angular/core';
import type { UserStoryProgress } from '@lingua-card/shared/domain';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LocalDataService } from '../../../core/services/local-data.service';
import { SyncService } from '../../../core/services/sync.service';
import { PlatformStoryApiService } from './platform-story-api.service';

@Injectable({ providedIn: 'root' })
export class PlatformStoryProgressService {
  private readonly api = inject(PlatformStoryApiService);
  private readonly auth = inject(AuthService);
  private readonly localData = inject(LocalDataService);
  private readonly sync = inject(SyncService);

  async loadAndMarkRead(storyId: string): Promise<UserStoryProgress | null> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return null;
    const cached = await this.localData.getPlatformStoryProgress(userId, storyId);
    const local = this.mergeProgress(cached, userId, storyId, { isRead: true, lastReadAt: new Date().toISOString() });
    await this.localData.setPlatformStoryProgress(userId, local);

    if (!navigator.onLine) {
      await this.sync.enqueue({ type: 'MARK_PLATFORM_STORY_READ', payload: { storyId } });
      return local;
    }

    try {
      await firstValueFrom(this.api.markAsRead(storyId));
      const server = await firstValueFrom(this.api.getProgress(storyId));
      const merged = server ? this.mergeProgress(server, userId, storyId, {
        isRead: true,
        lastReadAt: local.lastReadAt,
        savedWordIds: [...new Set([...server.savedWordIds, ...local.savedWordIds])],
      }) : local;
      await this.localData.setPlatformStoryProgress(userId, merged);
      return merged;
    } catch {
      await this.sync.enqueue({ type: 'MARK_PLATFORM_STORY_READ', payload: { storyId } });
      return local;
    }
  }

  async saveQuizScore(storyId: string, score: number): Promise<UserStoryProgress | null> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return null;
    const cached = await this.localData.getPlatformStoryProgress(userId, storyId);
    const local = this.mergeProgress(cached, userId, storyId, { quizScore: score });
    await this.localData.setPlatformStoryProgress(userId, local);
    if (!navigator.onLine) {
      await this.sync.enqueue({ type: 'SAVE_PLATFORM_STORY_QUIZ', payload: { storyId, score } });
      return local;
    }
    try {
      await firstValueFrom(this.api.saveQuizScore(storyId, score));
    } catch {
      await this.sync.enqueue({ type: 'SAVE_PLATFORM_STORY_QUIZ', payload: { storyId, score } });
    }
    return local;
  }

  async addSavedWord(storyId: string, wordId: string): Promise<UserStoryProgress | null> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return null;
    const cached = await this.localData.getPlatformStoryProgress(userId, storyId);
    const savedWordIds = [...new Set([...(cached?.savedWordIds ?? []), wordId])];
    const local = this.mergeProgress(cached, userId, storyId, { savedWordIds });
    await this.localData.setPlatformStoryProgress(userId, local);
    if (!navigator.onLine) {
      await this.sync.enqueue({ type: 'SAVE_PLATFORM_STORY_WORD', payload: { storyId, wordId } });
      return local;
    }
    try {
      await firstValueFrom(this.api.addSavedWord(storyId, wordId));
    } catch {
      await this.sync.enqueue({ type: 'SAVE_PLATFORM_STORY_WORD', payload: { storyId, wordId } });
    }
    return local;
  }

  private mergeProgress(
    progress: UserStoryProgress | null,
    userId: string,
    storyId: string,
    changes: Partial<UserStoryProgress>,
  ): UserStoryProgress {
    return {
      storyId,
      userId,
      isRead: false,
      quizScore: null,
      lastReadAt: null,
      savedWordIds: [],
      ...progress,
      ...changes,
    };
  }
}
