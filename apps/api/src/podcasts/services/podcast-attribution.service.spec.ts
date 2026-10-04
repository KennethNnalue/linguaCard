import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { PodcastRecommendationContext } from '@lingua-card/shared/domain';
import { LearningItemReadService } from '../../learning-items/services/learning-item-read.service';
import { PodcastAttributionService } from './podcast-attribution.service';
import { PodcastEventEntity } from '../entities/podcast-event.entity';
import { PodcastRecommendationAssignmentEntity } from '../entities/podcast-recommendation-assignment.entity';

const context: PodcastRecommendationContext = { recommendationId: 'recommendation', episodeId: 'episode', audioVersion: 2,
  placement: 'home', policyVersion: 'v2', discoveryLevel: 'A1', targetLanguage: 'de', sourceLanguage: 'en',
  experimentVersion: 'experiment-v2', cohort: 'treatment' };

async function setup() {
  const events = new Map<string, PodcastEventEntity>();
  const assignments = new Map<string, PodcastRecommendationAssignmentEntity>();
  const settings = new Map<string, string | boolean>();
  const active = { targetLanguage: 'de', sourceLanguage: 'en' };
  let target: Function = PodcastEventEntity;
  const builder = {
    insert: () => builder, into: (entity: Function) => { target = entity; return builder; },
    values: (row: Partial<PodcastEventEntity> & Partial<PodcastRecommendationAssignmentEntity>) => {
      if (!row.id) throw new Error('Missing fixture ID');
      if (target === PodcastRecommendationAssignmentEntity) {
        if (!assignments.has(row.id)) assignments.set(row.id, Object.assign(new PodcastRecommendationAssignmentEntity(), row));
      } else if (!events.has(row.id)) events.set(row.id, Object.assign(new PodcastEventEntity(), row));
      return builder;
    }, orIgnore: () => builder, execute: async () => undefined,
  };
  const manager = {
    findOneBy: async (entity: Function, where: { id: string; userId?: string; episodeId?: string }) => {
      const row = entity === PodcastRecommendationAssignmentEntity ? assignments.get(where.id) : events.get(where.id);
      if (!row || where.userId && row.userId !== where.userId || where.episodeId && (!('episodeId' in row) || row.episodeId !== where.episodeId)) return null;
      return row;
    },
    save: async (event: PodcastEventEntity) => { events.set(event.id, event); return event; },
    createQueryBuilder: () => builder,
  };
  const module = await Test.createTestingModule({ providers: [PodcastAttributionService,
    { provide: ConfigService, useValue: { get: (key: string) => settings.get(key) } },
    { provide: LearningItemReadService, useValue: { loadActiveLearningContext: async () => active } },
    { provide: DataSource, useValue: { manager, createQueryBuilder: () => builder,
      getRepository: (entity: Function) => ({ findOneBy: (where: { id: string }) => manager.findOneBy(entity, where) }) } },
  ] }).compile();
  return { service: module.get(PodcastAttributionService), manager: module.get(DataSource).manager, events, settings, active };
}
describe('server-validated podcast attribution', () => {
  it('persists cohort and allows independent surface switches without changing assignments', async () => {
    const { service, settings } = await setup();
    expect((await service.rollout('learner', 'home')).cohort).toBe('treatment');
    settings.set('PODCAST_RECOMMENDATION_PERCENT', '0');
    settings.set('PODCAST_RECOMMENDATIONS_HOME_ENABLED', false);
    expect((await service.rollout('learner', 'home')).enabled).toBe(false);
    expect((await service.rollout('learner', 'library')).enabled).toBe(true);
    expect((await service.rollout('new-account', 'library')).cohort).toBe('control');
  });
  it('rejects forged, cross-account, wrong-episode, replaced-audio and wrong-language exposures', async () => {
    const { service, manager, active } = await setup();
    await service.issue('learner', context);
    expect(await service.exposure(manager, 'learner', 'episode', 2, 'recommendation')).toEqual(context);
    expect(await service.exposure(manager, 'someone-else', 'episode', 2, 'recommendation')).toBeNull();
    expect(await service.exposure(manager, 'learner', 'other', 2, 'recommendation')).toBeNull();
    expect(await service.exposure(manager, 'learner', 'episode', 3, 'recommendation')).toBeNull();
    expect(await service.exposure(manager, 'learner', 'episode', 2, 'forged')).toBeNull();
    active.targetLanguage = 'fr';
    expect(await service.exposure(manager, 'learner', 'episode', 2, 'recommendation')).toBeNull();
  });
  it('requires actual start, counts unique played ranges per local day and ignores retries', async () => {
    const { service, manager, events } = await setup();
    const ranges = [{ startMs: 0, endMs: 20000 }];
    expect(await service.progress(manager, 'learner', 'episode', 2, 120000, 'journey', ranges, 'UTC')).toEqual({});
    expect(events.size).toBe(0);
    events.set('learner:start:journey', Object.assign(new PodcastEventEntity(), {
      id: 'learner:start:journey', userId: 'learner', episodeId: 'episode', metadata: { ...context, assisted: true },
    }));
    await service.progress(manager, 'learner', 'episode', 2, 120000, 'journey', ranges, 'UTC');
    await service.progress(manager, 'learner', 'episode', 2, 120000, 'journey', ranges, 'UTC');
    const day = [...events.values()].find(item => item.name === 'journey_listening_day');
    expect(day?.metadata).toEqual(expect.objectContaining({ listenedMs: 20000, meaningful: false, assisted: true }));
    await service.progress(manager, 'learner', 'episode', 2, 120000, 'journey', [{ startMs: 10000, endMs: 30000 }], 'UTC');
    expect(day?.metadata).toEqual(expect.objectContaining({ listenedMs: 30000, meaningful: true, placement: 'home' }));
    expect([...events.values()].filter(item => item.name === 'journey_listening_day')).toHaveLength(1);
    expect(await service.progress(manager, 'learner', 'episode', 3, 120000, 'journey', ranges, 'UTC')).toEqual({});
  });
});
