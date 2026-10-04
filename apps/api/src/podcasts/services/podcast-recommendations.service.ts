import { PodcastAttributionService } from './podcast-attribution.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, Not, IsNull } from 'typeorm';
import { randomUUID } from 'node:crypto';
import type { LearningStage, PodcastRecommendation, PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';
import { PodcastListeningProgressEntity } from '../entities/podcast-listening-progress.entity';
import { ReviewSessionEntity } from '../../review/review-session.entity';
import { toPodcastThumbnail } from '../podcast-thumbnail.mapper';
import { rankPodcastRecommendations, recommendationFit, recommendationReason, vocabularyFamiliarity, type RecommendationWord } from '../domain/podcast-recommendations';
import { PodcastRecommendationsQueryDto } from '../dto/podcast-recommendations-query.dto';

interface WordRow {
  episodeId: string; lexemeId: string; text: string; translation: string;
  owned: boolean; mastery: LearningStage | null; reviewed: boolean;
}
@Injectable()
export class PodcastRecommendationsService {
  constructor(private readonly dataSource: DataSource, private readonly contexts: LearningItemReadService, private readonly attribution: PodcastAttributionService) {}

  async recommend(userId: string, query: PodcastRecommendationsQueryDto): Promise<PodcastRecommendationResponse> {
    const rollout = await this.attribution.rollout(userId, query.placement ?? 'home');
    if (!rollout.enabled) return { recommendations: [], evidence: 'current', rollout };
    const context = await this.contexts.loadActiveLearningContext(userId);
    let pendingSession = false;
    if (query.sessionId) {
      const session = await this.dataSource.getRepository(ReviewSessionEntity).findOneBy({ id: query.sessionId });
      if (session && session.userId !== userId) throw new NotFoundException('Review session not found');
      pendingSession = !session;
    }
    const topics = await this.dataSource.getRepository(PodcastTopicEntity).findBy({
      status: 'published', targetLanguage: context.targetLanguage, translationLanguage: context.sourceLanguage,
    });
    if (!topics.length) return { recommendations: [], evidence: pendingSession ? 'pending_sync' : 'current' };
    const episodes = await this.dataSource.getRepository(PodcastEpisodeEntity).find({
      where: { topicId: In(topics.map(topic => topic.id)), status: 'published', audioUrl: Not(IsNull()),
        ...(query.level && query.level !== 'all' ? { level: query.level } : {}) },
      order: { publishedAt: 'DESC', id: 'ASC' }, take: 200,
    });
    const valid = episodes.filter(episode => episode.audioUrl?.trim() && episode.audioDurationMs > 0);
    if (!valid.length) return { recommendations: [], evidence: pendingSession ? 'pending_sync' : 'current' };
    const ids = valid.map(episode => episode.id);
    const [rows, progress, thumbnails] = await Promise.all([
      this.dataSource.query<WordRow[]>(`
        SELECT link."episodeId", link."lexemeId", lexeme."displayText" AS text,
          localization.translation, item.id IS NOT NULL AS owned,
          scheduling.state->>'stage' AS mastery,
          EXISTS (SELECT 1 FROM review_commits commit WHERE commit."userId" = $1
            AND commit."cardId" = COALESCE(item."legacyCardId", item.id)
            AND (($4::varchar IS NOT NULL AND commit."sessionId" = $4)
              OR ($4::varchar IS NULL AND commit."reviewedAt" >= NOW() - INTERVAL '7 days'))) AS reviewed
        FROM podcast_episode_vocabulary link
        JOIN lexemes lexeme ON lexeme.id = link."lexemeId"
        JOIN lexeme_localizations localization ON localization."lexemeId" = lexeme.id
          AND localization.language = $3 AND localization."isActive" = true
        LEFT JOIN learning_items item ON item."lexemeId" = lexeme.id
          AND item."userId" = $1 AND item."learningContextId" = $2
        LEFT JOIN review_scheduling scheduling ON scheduling."cardId" = COALESCE(item."legacyCardId", item.id)
        WHERE link."episodeId" = ANY($5::varchar[]) ORDER BY link.position, link."lexemeId"
      `, [userId, context.id, context.sourceLanguage, pendingSession ? null : query.sessionId ?? null, ids]),
      this.dataSource.getRepository(PodcastListeningProgressEntity).findBy({ userId, episodeId: In(ids) }),
      this.dataSource.getRepository(PodcastThumbnailAssetEntity).findBy({ id: In(valid.flatMap(episode => episode.thumbnailAssetId ? [episode.thumbnailAssetId] : [])) }),
    ]);
    const thumbnailById = new Map(thumbnails.map(item => [item.id, item]));
    const topicById = new Map(topics.map(topic => [topic.id, topic]));
    const audioVersionById = new Map(valid.map(episode => [episode.id, episode.audioVersion]));
    const alreadyListening = new Set(progress.filter(item =>
      item.audioVersion === audioVersionById.get(item.episodeId)
      && (item.completedAt !== null || item.positionMs > 0 || item.qualifyingListenedMs > 0),
    ).map(item => item.episodeId));
    const candidates = valid.filter(episode => !alreadyListening.has(episode.id) && thumbnailById.has(episode.thumbnailAssetId ?? ''))
      .map(episode => ({ ...episode, durationMs: episode.audioDurationMs,
        words: rows.filter(row => row.episodeId === episode.id) }));
    const recommendations: PodcastRecommendation[] = rankPodcastRecommendations(candidates, query.placement === 'library' ? 10 : 1).flatMap(episode => {
      const thumbnail = thumbnailById.get(episode.thumbnailAssetId ?? '');
      const topic = topicById.get(episode.topicId);
      if (!thumbnail || !topic) return [];
      const words: RecommendationWord[] = [...new Map(episode.words.map(word => [word.lexemeId, word])).values()];
      const reason = recommendationReason(words, !!query.sessionId && !pendingSession);
      const matched = words.filter(word => word.owned && (reason === 'vocabulary' || word.reviewed));
      return [{ id: randomUUID(), policyVersion: 'vocabulary-v2', fit: recommendationFit(words), reason,
        matchCount: matched.length, matchedWords: matched.slice(0, 3).map(({ lexemeId, text, translation }) => ({ lexemeId, text, translation })),
        familiarity: vocabularyFamiliarity(words),
        episode: { id: episode.id, title: episode.title, titleTranslation: episode.titleTranslation,
          level: episode.level, position: episode.position, durationMs: episode.audioDurationMs,
          focusVocabularyCount: words.length, thumbnail: toPodcastThumbnail(thumbnail),
          topicId: topic.id, topicTitle: topic.title, topicTitleTranslation: topic.titleTranslation },
      }];
    });
    for (const recommendation of recommendations) {
      const audioVersion = audioVersionById.get(recommendation.episode.id);
      if (!audioVersion) continue;
      recommendation.context = { recommendationId: recommendation.id, episodeId: recommendation.episode.id,
        audioVersion, placement: query.placement ?? 'home', policyVersion: recommendation.policyVersion,
        discoveryLevel: query.level ?? 'all', targetLanguage: context.targetLanguage, sourceLanguage: context.sourceLanguage,
        experimentVersion: rollout.experimentVersion, cohort: rollout.cohort };
      await this.attribution.issue(userId, recommendation.context);
    }
    return { recommendations, evidence: pendingSession ? 'pending_sync' : 'current', rollout };
  }
}
