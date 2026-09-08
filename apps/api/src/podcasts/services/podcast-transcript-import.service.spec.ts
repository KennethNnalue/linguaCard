import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { LegacyVocabularyProjectionService } from '../../vocabulary/services/legacy-vocabulary-projection.service';
import { StorageService } from '../../storage/storage.service';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { normalizeTranscriptVocabularyReferences } from '../domain/normalize-transcript-vocabulary-references';
import { PodcastTranscriptPayloadDto } from '../dto/admin-podcast.dto';
import {
  estimatePodcastDuration, podcastTranscriptFingerprint, PodcastTranscriptImportService,
} from './podcast-transcript-import.service';
import {
  createPodcastTranscriptManifestDraft, finalizePodcastTranscriptManifest,
} from '../domain/podcast-transcript-manifest';

const episodeMetadata = {
  title: 'Und was hast du gemacht?',
  titleTranslation: 'And what did you do?',
  description: 'Two people discuss work, study, and recent life events.',
};

const payload: PodcastTranscriptPayloadDto = {
  schemaVersion: 1,
  episode: episodeMetadata,
  speakers: [{ key: 'guest', name: 'Mia', voiceGender: 'female', voiceId: 'voice-1' }],
  turns: [{
    speakerKey: 'guest', targetText: 'Können wir getrennt bezahlen?',
    translation: 'Can we pay separately?', vocabularyRefs: ['getrennt-bezahlen'],
  }],
  vocabulary: [{
    key: 'getrennt-bezahlen', text: 'getrennt bezahlen',
    translation: 'to pay separately', importance: 'essential',
  }],
};

describe('podcast transcript import helpers', () => {
  it('creates a stable SHA-256 fingerprint for identical content', () => {
    expect(podcastTranscriptFingerprint(payload)).toMatch(/^[a-f0-9]{64}$/);
    expect(podcastTranscriptFingerprint({
      ...payload,
      speakers: payload.speakers.map(speaker => ({ ...speaker })),
      turns: payload.turns.map(turn => ({ ...turn, vocabularyRefs: [...turn.vocabularyRefs] })),
      vocabulary: payload.vocabulary.map(item => ({ ...item })),
    }))
      .toBe(podcastTranscriptFingerprint(payload));
  });

  it('changes the fingerprint when derived episode metadata changes', () => {
    expect(podcastTranscriptFingerprint({
      ...payload,
      episode: { ...episodeMetadata, title: 'Was hast du gemacht?' },
    })).not.toBe(podcastTranscriptFingerprint(payload));
  });

  it('estimates speaking duration from target-language words', () => {
    expect(estimatePodcastDuration(payload)).toBe(1846);
  });
});


describe('apartment transcript import regression', () => {
  it('rejects the apartment JSON when required vocabulary is omitted or unused', async () => {
    const parsed: unknown = JSON.parse(readFileSync(join(__dirname, '../domain/fixtures/die-neue-wohnung.json'), 'utf8'));
    const input = plainToInstance(PodcastTranscriptPayloadDto, parsed);
    await expect(validate(input, { whitelist: true })).resolves.toHaveLength(0);
    const dataSource = new DataSource({ type: 'postgres' });
    jest.spyOn(dataSource.getRepository(PodcastEpisodeEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastEpisodeEntity(), {
        id: 'episode', topicId: 'topic',
        generationInput: { vocabulary: [
          'stellen (Carla will den Computer in die Küche stellen.)',
          'aus|füllen (ein Formular ausfüllen)', 'besichtigen', 'die Kiste, -n',
          'das Licht, -er', 'packen', 'schließen, er schließt, hat geschlossen',
          'die Tür, -en', 'um|ziehen, er zieht um, ist umgezogen', 'der Umzug, "-e',
          'unterschreiben, er unterschreibt, hat unterschrieben', 'der Vermieter, -',
          'die Vermieterin, -nen', 'der Vertrag, "-e', 'zu|machen', 'freuen (sich)',
          'scheinen, er scheint, hat geschienen', 'fehlend', 'bald', 'die Feier, -n',
          'der Glückwunsch, "-e', 'der Samstagabend, -e',
        ] },
      }),
    );
    jest.spyOn(dataSource.getRepository(PodcastTopicEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastTopicEntity(), { id: 'topic', targetLanguage: 'de', translationLanguage: 'en' }),
    );
    jest.spyOn(dataSource.getRepository(LexemeEntity), 'find').mockResolvedValue([]);
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptImportService, LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
      { provide: LegacyVocabularyProjectionService, useValue: {} },
      { provide: StorageService, useValue: {} },
    ] }).compile();
    try {
      const service = module.get(PodcastTranscriptImportService);
      const preview = await service.preview('episode', input);
      expect(preview.status).toBe('conflicts');
      expect(preview.conflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-vocabulary',
          message: expect.stringContaining('Vermieterin'),
        }),
        expect.objectContaining({ code: 'unreferenced-vocabulary' }),
      ]));
      expect(preview.counts).toMatchObject({ speakers: 2, turns: 11, vocabulary: 15 });
      const normalized = normalizeTranscriptVocabularyReferences(input);
      expect(normalized.turns[10].vocabularyRefs).toEqual(['zu-machen', 'die-tuer']);
      expect(preview.fingerprint).toBe(podcastTranscriptFingerprint(normalized));
      expect((await service.preview('episode', normalized)).fingerprint).toBe(preview.fingerprint);
    } finally {
      await module.close();
    }
  });
});

describe('external transcript manifest import', () => {
  it('uses the saved canonical identity and vocabulary fields for schema version 2', async () => {
    const draft = createPodcastTranscriptManifestDraft(['die Wohnung, -en = Apartment'], 'de', 'en');
    const manifest = finalizePodcastTranscriptManifest(draft, draft.items.map(item => ({
      ...item,
      canonicalLexemeId: 'wohnung-lexeme',
    })));
    const input = plainToInstance(PodcastTranscriptPayloadDto, {
      schemaVersion: 2,
      manifestId: manifest.id,
      episode: episodeMetadata,
      speakers: [{ key: 'host', name: 'Mia', voiceGender: 'female' }],
      turns: [{
        speakerKey: 'host', targetText: 'Das ist meine Wohnung.',
        translation: 'This is my apartment.', vocabularyRefs: ['wohnung'],
      }],
      vocabulary: [{
        key: 'wohnung', text: 'Changed by the external model',
        translation: 'flat', importance: 'supporting',
      }],
    });
    const dataSource = new DataSource({ type: 'postgres' });
    jest.spyOn(dataSource.getRepository(PodcastEpisodeEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastEpisodeEntity(), {
        id: 'episode', topicId: 'topic',
        generationInput: { vocabulary: ['die Wohnung, -en = Apartment'], transcriptManifest: manifest },
      }),
    );
    jest.spyOn(dataSource.getRepository(PodcastTopicEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastTopicEntity(), {
        id: 'topic', targetLanguage: 'de', translationLanguage: 'en',
      }),
    );
    jest.spyOn(dataSource.getRepository(LexemeEntity), 'find').mockResolvedValue([
      Object.assign(new LexemeEntity(), {
        id: 'wohnung-lexeme', language: 'de', normalizedLemma: 'wohnung', displayText: 'Wohnung',
        partOfSpeech: 'noun', grammarDiscriminator: 'article=die;gender=feminine', grammar: { article: 'die' },
      }),
    ]);
    jest.spyOn(dataSource.getRepository(LexemeLocalizationEntity), 'find').mockResolvedValue([]);
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptImportService, LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
      { provide: LegacyVocabularyProjectionService, useValue: {} },
      { provide: StorageService, useValue: {} },
    ] }).compile();
    try {
      const preview = await module.get(PodcastTranscriptImportService).preview('episode', input);

      expect(preview.status).toBe('valid');
      expect(preview.vocabulary).toEqual([expect.objectContaining({
        key: 'wohnung', lexemeId: 'wohnung-lexeme', status: 'resolved',
      })]);
      expect(preview.fingerprint).not.toBe(podcastTranscriptFingerprint(input));
    } finally {
      await module.close();
    }
  });

  it('rejects a schema version 2 transcript from a different copied prompt', async () => {
    const manifest = createPodcastTranscriptManifestDraft(['die Wohnung, -en'], 'de', 'en');
    const input = plainToInstance(PodcastTranscriptPayloadDto, {
      schemaVersion: 2,
      manifestId: '0'.repeat(64),
      episode: episodeMetadata,
      speakers: [{ key: 'host', name: 'Mia', voiceGender: 'female' }],
      turns: [{
        speakerKey: 'host', targetText: 'Das ist meine Wohnung.',
        translation: 'This is my apartment.', vocabularyRefs: ['wohnung'],
      }],
      vocabulary: [{ key: 'wohnung', text: 'Wohnung', translation: 'apartment', importance: 'essential' }],
    });
    const dataSource = new DataSource({ type: 'postgres' });
    jest.spyOn(dataSource.getRepository(PodcastEpisodeEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastEpisodeEntity(), {
        id: 'episode', topicId: 'topic',
        generationInput: { vocabulary: ['die Wohnung, -en'], transcriptManifest: manifest },
      }),
    );
    jest.spyOn(dataSource.getRepository(PodcastTopicEntity), 'findOneBy').mockResolvedValue(
      Object.assign(new PodcastTopicEntity(), {
        id: 'topic', targetLanguage: 'de', translationLanguage: 'en',
      }),
    );
    jest.spyOn(dataSource.getRepository(LexemeEntity), 'find').mockResolvedValue([]);
    const module = await Test.createTestingModule({ providers: [
      PodcastTranscriptImportService, LexemeIdentityService,
      { provide: DataSource, useValue: dataSource },
      { provide: LegacyVocabularyProjectionService, useValue: {} },
      { provide: StorageService, useValue: {} },
    ] }).compile();
    try {
      const preview = await module.get(PodcastTranscriptImportService).preview('episode', input);

      expect(preview.conflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'manifest-mismatch', pointer: '/manifestId' }),
      ]));
    } finally {
      await module.close();
    }
  });
});
