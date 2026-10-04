import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import { mergePodcastPlaybackRanges, podcastPlaybackRangeDuration,
  type PodcastRecommendationContext, type PodcastRecommendationPlacement, type PodcastRecommendationResponse,
  type PodcastPlaybackRange } from '@lingua-card/shared/domain';
import { PodcastRecommendationAssignmentEntity } from '../entities/podcast-recommendation-assignment.entity';
import { PodcastEventEntity } from '../entities/podcast-event.entity';
import { cohortForUser, isRecord, localListeningDate, readPlaybackRanges, readRecommendationContext } from '../domain/podcast-attribution';

@Injectable()
export class PodcastAttributionService {
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService, private readonly contexts: LearningItemReadService) {}
  async rollout(userId: string, placement: PodcastRecommendationPlacement): Promise<NonNullable<PodcastRecommendationResponse['rollout']>> {
    const experimentVersion = this.config.get<string>('PODCAST_RECOMMENDATION_EXPERIMENT_VERSION') ?? 'vocabulary-v2-baseline';
    const id = `${userId}:podcast-cohort:${experimentVersion}`;
    const repo = this.dataSource.getRepository(PodcastRecommendationAssignmentEntity);
    const previous = await repo.findOneBy({ id });
    const saved = previous?.cohort;
    const percent = Number(this.config.get<string>('PODCAST_RECOMMENDATION_PERCENT') ?? 100);
    const internal = (this.config.get<string>('PODCAST_RECOMMENDATION_INTERNAL_USER_IDS') ?? '').split(',').filter(Boolean);
    const cohort = saved === 'treatment' || saved === 'control' ? saved
      : internal.length && !internal.includes(userId) ? 'control' : cohortForUser(userId, experimentVersion, Number.isFinite(percent) ? percent : 0);
    if (!previous) {
      await this.dataSource.createQueryBuilder().insert().into(PodcastRecommendationAssignmentEntity).values({
        id, userId, experimentVersion, cohort,
      }).orIgnore().execute();
    }
    const assignment = await repo.findOneBy({ id });
    const assignedCohort = assignment?.cohort ?? cohort;
    const switchValue = this.config.get<string | boolean>(`PODCAST_RECOMMENDATIONS_${placement.toUpperCase()}_ENABLED`);
    return { enabled: switchValue !== 'false' && switchValue !== false && assignedCohort === 'treatment', experimentVersion, cohort: assignedCohort };
  }
  async issue(userId: string, context: PodcastRecommendationContext): Promise<void> {
    await this.dataSource.createQueryBuilder().insert().into(PodcastEventEntity).values({
      id: `${userId}:exposure:${context.recommendationId}`, userId, episodeId: context.episodeId,
      name: 'recommendation_exposure', metadata: context,
    }).orIgnore().execute();
  }

  async exposure(manager: EntityManager, userId: string, episodeId: string, audioVersion: number,
    recommendationId?: string): Promise<PodcastRecommendationContext | null> {
    if (!recommendationId) return null;
    const event = await manager.findOneBy(PodcastEventEntity, { id: `${userId}:exposure:${recommendationId}`, userId, episodeId });
    const context = readRecommendationContext(event?.metadata);
    if (!context || context.episodeId !== episodeId || context.audioVersion !== audioVersion) return null;
    const active = await this.contexts.loadActiveLearningContext(userId);
    return (!context.learningContextId || context.learningContextId === active.id) && active.targetLanguage === context.targetLanguage && active.sourceLanguage === context.sourceLanguage ? context : null;
  }
  async selection(manager: EntityManager, userId: string, episodeId: string, audioVersion: number, journeyId?: string): Promise<object> {
    if (!journeyId) return {};
    const event = await manager.findOneBy(PodcastEventEntity, { id: `${userId}:selection:${journeyId}`, userId, episodeId });
    const context = readRecommendationContext(event?.metadata);
    if (!context || context.audioVersion !== audioVersion) return {};
    const active = await this.contexts.loadActiveLearningContext(userId);
    return (!context.learningContextId || context.learningContextId === active.id) && active.targetLanguage === context.targetLanguage && active.sourceLanguage === context.sourceLanguage
      ? { ...context, assisted: isRecord(event?.metadata) && event.metadata['assisted'] === true } : {};
  }
  async progress(manager: EntityManager, userId: string, episodeId: string, audioVersion: number,
    durationMs: number, journeyId: string | undefined, ranges: readonly PodcastPlaybackRange[], timezone: string): Promise<object> {
    if (!journeyId) return {};
    const start = await manager.findOneBy(PodcastEventEntity, { id: `${userId}:start:${journeyId}`, userId, episodeId });
    if (!start || !isRecord(start.metadata) || start.metadata['audioVersion'] !== audioVersion) return {};
    let origin = readRecommendationContext(start.metadata);
    if (origin) {
      const active = await this.contexts.loadActiveLearningContext(userId);
      if (active.targetLanguage !== origin.targetLanguage || active.sourceLanguage !== origin.sourceLanguage) origin = null;
    }
    const attribution = { ...(origin ?? {}), journeyId, audioVersion, assisted: start.metadata['assisted'] === true };
    const day = localListeningDate(new Date(), timezone);
    const id = `${userId}:listening-day:${journeyId}:${day}`;
    const existing = await manager.findOneBy(PodcastEventEntity, { id, userId, episodeId });
    const previous = existing && isRecord(existing.metadata) ? readPlaybackRanges(existing.metadata['ranges']) : [];
    const merged = mergePodcastPlaybackRanges(previous, ranges, durationMs);
    const listenedMs = podcastPlaybackRangeDuration(merged);
    const metadata = { ...attribution, localDate: day, timezone, ranges: merged, listenedMs,
      meaningful: durationMs > 0 && listenedMs >= Math.min(30000, durationMs) };
    if (existing) { existing.metadata = metadata; await manager.save(existing); }
    else await manager.createQueryBuilder().insert().into(PodcastEventEntity).values({
      id, userId, episodeId, name: 'journey_listening_day', metadata,
    }).orIgnore().execute();
    return attribution;
  }
}
