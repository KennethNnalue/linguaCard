import { Injectable } from '@nestjs/common';
import { PodcastOnboardingExampleRepository } from '../repositories/podcast-onboarding-example.repository';
import type { PodcastOnboardingExample } from '@lingua-card/shared/domain';
import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { transcriptContainsHeadword } from '../domain/podcast-onboarding-example';
@Injectable()
export class PodcastOnboardingExampleService {
  constructor(private readonly repository: PodcastOnboardingExampleRepository, private readonly contexts: LearningItemReadService) {}
  async forCollection(userId: string, collectionId: string): Promise<PodcastOnboardingExample | null> {
    const context = await this.contexts.loadActiveLearningContext(userId);
    const rows = await this.repository.findCandidates(collectionId, context.targetLanguage, context.sourceLanguage);
    const row = rows.find(item => transcriptContainsHeadword(item.transcriptText, item.word));
    if (!row) return null;
    return { episodeId: row.episodeId, episodeTitle: row.episodeTitle, episodeTitleTranslation: row.episodeTitleTranslation,
      audioUrl: row.audioUrl, audioVersion: row.audioVersion, lexemeId: row.lexemeId, word: row.word, translation: row.translation,
      transcriptText: row.transcriptText, transcriptTranslation: row.transcriptTranslation, startMs: row.startMs, endMs: row.endMs };
  }
}
