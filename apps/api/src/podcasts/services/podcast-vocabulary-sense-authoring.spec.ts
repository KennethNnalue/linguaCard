import { DataSource } from 'typeorm';
import { PodcastTranscriptManifestService } from './podcast-transcript-manifest.service';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';

function fixture(vocabulary = ['das (Das ist Frau Kowalski.) = this; that']) {
  const lexemes = [Object.assign(new LexemeEntity(), {
    id: 'old', language: 'de', normalizedLemma: 'das', displayText: 'das', partOfSpeech: 'other', grammar: {},
  })];
  const localizations = [Object.assign(new LexemeLocalizationEntity(), {
    lexemeId: 'old', language: 'en', translation: 'the (neuter article)', isActive: true,
  })];
  const episode = { id: 'episode', topicId: 'topic', status: 'draft', audioGenerationStatus: 'idle', generationInput: { vocabulary } };
  const topic = { id: 'topic', targetLanguage: 'de', translationLanguage: 'en', level: 'A1' };
  const inserts: unknown[] = [];
  function repository(entity: unknown) {
    const rows = entity === LexemeEntity ? lexemes : localizations;
    return {
      find: async () => rows,
      findOneBy: async (query: Record<string, unknown>) => rows.find(row =>
        Object.entries(query).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) ?? null,
      createQueryBuilder: () => {
        let values: Record<string, unknown>;
        const builder = {
          insert: () => builder,
          values: (value: Record<string, unknown>) => { values = value; return builder; },
          orIgnore: () => builder,
          execute: async () => {
            inserts.push(values);
            if (!rows.some(row => row.id === values['id'])) rows.push(Object.assign({}, values) as never);
          },
        };
        return builder;
      },
    };
  }
  const manager = {
    findOne: jest.fn(async (entity: unknown) => entity === PodcastEpisodeEntity ? episode : null),
    findOneBy: jest.fn(async () => topic),
    getRepository: repository,
  };
  const dataSource = { transaction: async (callback: (manager: unknown) => unknown) => callback(manager), getRepository: repository };
  const service = new PodcastTranscriptManifestService(dataSource as unknown as DataSource, new LexemeIdentityService());
  return { service, episode, topic, lexemes, localizations, inserts, manager };
}

describe('explicit podcast dictionary sense authoring', () => {
  it('adds an independent meaning without overwriting the existing article card', async () => {
    const f = fixture();
    const old = JSON.stringify([f.lexemes[0], f.localizations[0]]);
    const result = await f.service.createSense('episode', 'das', 'this; that');
    expect(result.lexemeId).not.toBe('old');
    expect(f.lexemes).toHaveLength(2);
    expect(f.lexemes[1].grammarDiscriminator).toMatch(/^sense=/);
    expect(JSON.stringify([f.lexemes[0], f.localizations[0]])).toBe(old);
    const prepared = await f.service.prepare(f.episode.generationInput.vocabulary, 'de', 'en');
    expect(prepared.ambiguities).toEqual([]);
    expect(prepared.manifest.items[0]).toMatchObject({ canonicalLexemeId: result.lexemeId, translation: 'this; that' });
    expect(f.manager.findOne).toHaveBeenCalledWith(PodcastEpisodeEntity, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });
  it('repeated requests reuse an identity and same-lemma meanings stay distinct', async () => {
    const f = fixture(['aus = from']);
    const first = await f.service.createSense('episode', 'aus', 'from');
    const repeated = await f.service.createSense('episode', 'aus', ' FROM ');
    const second = await f.service.createSense('episode', 'aus', 'made of');
    expect(repeated.lexemeId).toBe(first.lexemeId);
    expect(second.lexemeId).not.toBe(first.lexemeId);
    expect(f.lexemes).toHaveLength(3);
    expect(f.localizations.find(item => item.lexemeId === first.lexemeId)?.translation).toBe('from');
    const prepared = await f.service.prepare(['aus'], 'de', 'en');
    expect(prepared.ambiguities).toHaveLength(1);
  });
  it.each(['published', 'queued', 'generating'])('rejects %s episodes before dictionary writes', async status => {
    const f = fixture(); f.episode.status = status;
    await expect(f.service.createSense('episode', 'das', 'this')).rejects.toThrow('editable draft');
    expect(f.inserts).toEqual([]);
  });
  it('rejects unknown keys and blank meanings before writes', async () => {
    const f = fixture();
    await expect(f.service.createSense('episode', 'aus', 'from')).rejects.toThrow('Save the vocabulary entry');
    await expect(f.service.createSense('episode', 'das', ' ')).rejects.toThrow('Enter a meaning');
    expect(f.inserts).toEqual([]);
  });
  it('retains a genuine noun article on the authored sense', async () => {
    const f = fixture(['der Band = volume']);
    const result = await f.service.createSense('episode', 'band', 'volume');
    expect(result).toMatchObject({ article: 'der', partOfSpeech: 'noun' });
    expect(f.lexemes[1].grammarDiscriminator).toMatch(/^article=der;gender=;sense=/);
  });
});
