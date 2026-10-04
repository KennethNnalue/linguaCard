import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PodcastEventsService } from './podcast-events.service';
import { PodcastAttributionService } from './podcast-attribution.service';
import { PodcastEventEntity } from '../entities/podcast-event.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';

async function setup() {
  const events = new Map<string, PodcastEventEntity>();
  const episode = Object.assign(new PodcastEpisodeEntity(), { id: 'episode', topicId: 'topic', audioVersion: 2 });
  const topic = Object.assign(new PodcastTopicEntity(), { id: 'topic', targetLanguage: 'de', translationLanguage: 'en' });
  const origin = { recommendationId: 'issued', placement: 'library', policyVersion: 'server-v2', audioVersion: 2 };
  const builder = { insert: () => builder, into: () => builder,
    values: (row: Partial<PodcastEventEntity>) => {
      if (!row.id) throw new Error('Missing fixture ID');
      if (!events.has(row.id)) events.set(row.id, Object.assign(new PodcastEventEntity(), row));
      return builder;
    }, orIgnore: () => builder, execute: async () => undefined };
  const manager = {
    query: jest.fn(async () => undefined),
    findOneBy: async (entity: Function, where: { id: string }) => entity === PodcastEpisodeEntity ? episode
      : entity === PodcastTopicEntity ? topic : events.get(where.id) ?? null,
    save: async (event: PodcastEventEntity) => { events.set(event.id, event); return event; },
    createQueryBuilder: () => builder,
  };
  const module = await Test.createTestingModule({ providers: [PodcastEventsService,
    { provide: DataSource, useValue: { transaction: (operation: (value: typeof manager) => Promise<void>) => operation(manager) } },
    { provide: PodcastAttributionService, useValue: {
      exposure: async (_manager: unknown, _user: string, _episode: string, _version: number, id?: string) => id === 'issued' ? origin : null,
      selection: async (_manager: unknown, user: string, _episode: string, _version: number, id?: string) => events.get(`${user}:selection:${id}`)?.metadata ?? {},
    } },
  ] }).compile();
  return { service: module.get(PodcastEventsService), events };
}
describe('podcast event source and journey qualification', () => {
  it('does not attribute a start to an unselected impression and ignores client policy claims', async () => {
    const { service, events } = await setup();
    await service.record('user', { eventId: 'impression', episodeId: 'episode', name: 'recommendation_impression', recommendationId: 'issued', policyVersion: 'forged' });
    await service.record('user', { eventId: 'start', episodeId: 'episode', name: 'playback_started', journeyId: 'journey', recommendationId: 'issued' });
    expect(events.get('user:impression')?.metadata).toEqual(expect.objectContaining({ policyVersion: 'server-v2' }));
    expect(events.get('user:start:journey')?.metadata).not.toHaveProperty('recommendationId');
  });
  it('carries explicit selection through review assistance and records one start per journey', async () => {
    const { service, events } = await setup();
    await service.record('user', { eventId: 'select', episodeId: 'episode', name: 'recommendation_selected', journeyId: 'journey', recommendationId: 'issued' });
    await service.record('user', { eventId: 'review', episodeId: 'episode', name: 'preparation_review_started', journeyId: 'journey' });
    await service.record('user', { eventId: 'start', episodeId: 'episode', name: 'playback_started', journeyId: 'journey' });
    await service.record('user', { eventId: 'retry', episodeId: 'episode', name: 'playback_started', journeyId: 'journey' });
    expect(events.get('user:start:journey')?.metadata).toEqual(expect.objectContaining({ recommendationId: 'issued', assisted: true }));
    expect([...events.values()].filter(event => event.name === 'playback_started')).toHaveLength(1);
  });
});
