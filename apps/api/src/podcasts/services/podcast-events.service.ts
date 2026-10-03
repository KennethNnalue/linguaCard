import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { PodcastEventEntity } from '../entities/podcast-event.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastEventDto } from '../dto/podcast-event.dto';

export async function recordPodcastMilestone(manager: EntityManager, userId: string, episodeId: string, audioVersion: number,
  name: 'meaningful_listening' | 'completed'): Promise<void> {
  await manager.createQueryBuilder().insert().into(PodcastEventEntity).values({
    id: `${userId}:${episodeId}:v${audioVersion}:${name}`, userId, episodeId, name, metadata: { audioVersion },
  }).orIgnore().execute();
}
@Injectable()
export class PodcastEventsService {
  constructor(private readonly dataSource: DataSource) {}
  async record(userId: string, event: PodcastEventDto): Promise<void> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: event.episodeId, status: 'published' });
    if (!episode) throw new NotFoundException('Episode not found');
    await this.dataSource.createQueryBuilder().insert().into(PodcastEventEntity).values({
      id: `${userId}:${event.eventId}`, userId, episodeId: event.episodeId, name: event.name,
      metadata: { placement: event.placement, recommendationId: event.recommendationId, policyVersion: event.policyVersion },
    }).orIgnore().execute();
  }
}
