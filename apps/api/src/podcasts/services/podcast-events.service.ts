import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { PodcastEventEntity } from '../entities/podcast-event.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastEventDto } from '../dto/podcast-event.dto';
import { PodcastAttributionService } from './podcast-attribution.service';
import { isRecord } from '../domain/podcast-attribution';

export async function recordPodcastMilestone(manager: EntityManager, userId: string, episodeId: string, audioVersion: number,
  name: 'meaningful_listening' | 'completed', attribution: object = {}): Promise<void> {
  await manager.createQueryBuilder().insert().into(PodcastEventEntity).values({
    id: `${userId}:${episodeId}:v${audioVersion}:${name}`, userId, episodeId, name, metadata: { ...attribution, audioVersion },
  }).orIgnore().execute();
}
@Injectable()
export class PodcastEventsService {
  constructor(private readonly dataSource: DataSource, private readonly attribution: PodcastAttributionService) {}
  async record(userId: string, event: PodcastEventDto): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const episode = await manager.findOneBy(PodcastEpisodeEntity, { id: event.episodeId, status: 'published' });
      if (!episode) throw new NotFoundException('Episode not found');
      const topic = await manager.findOneBy(PodcastTopicEntity, { id: episode.topicId, status: 'published' });
      if (!topic) throw new NotFoundException('Topic not found');
      if (event.journeyId) await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`podcast-journey:${userId}:${event.journeyId}`]);
      const exposure = await this.attribution.exposure(manager, userId, episode.id, episode.audioVersion, event.recommendationId);
      const selection = await this.attribution.selection(manager, userId, episode.id, episode.audioVersion, event.journeyId);
      const transition = event.name === 'preparation_review_started' || event.name === 'preparation_review_returned';
      if (transition && event.journeyId) {
        const selected = await manager.findOneBy(PodcastEventEntity, { id: `${userId}:selection:${event.journeyId}`, userId, episodeId: episode.id });
        if (selected && isRecord(selected.metadata) && selected.metadata['audioVersion'] === episode.audioVersion) {
          selected.metadata = { ...selected.metadata, assisted: true }; await manager.save(selected);
        }
      }
      const origin = event.name === 'recommendation_impression' || event.name === 'recommendation_selected' || event.name === 'preview_opened'
        ? exposure ?? {} : selection;
      const id = event.journeyId && event.name === 'recommendation_selected' ? `${userId}:selection:${event.journeyId}`
        : event.journeyId && event.name === 'playback_started' ? `${userId}:start:${event.journeyId}` : `${userId}:${event.eventId}`;
      await manager.createQueryBuilder().insert().into(PodcastEventEntity).values({
        id, userId, episodeId: episode.id, name: event.name,
        metadata: { targetLanguage: topic.targetLanguage, sourceLanguage: topic.translationLanguage, ...origin,
          audioVersion: episode.audioVersion, journeyId: event.journeyId,
          ...(event.name === 'recommendation_selected' ? { assisted: false } : transition ? { assisted: true } : {}) },
      }).orIgnore().execute();
    });
  }
}
