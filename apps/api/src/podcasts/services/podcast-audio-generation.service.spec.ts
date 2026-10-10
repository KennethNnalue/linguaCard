import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { ElevenLabsDialogueAdapter } from '../infrastructure/elevenlabs-dialogue.adapter';
import { AdminPodcastsService } from './admin-podcasts.service';
import { PodcastAudioGenerationService } from './podcast-audio-generation.service';

describe('PodcastAudioGenerationService', () => {
  it('keeps the existing approved audio when a new provider attempt fails', async () => {
    const episode = Object.assign(new PodcastEpisodeEntity(), {
      id: 'episode', topicId: 'topic', status: 'ready_for_review' as const,
      transcriptFingerprint: 'fingerprint', thumbnailAssetId: null,
      contentVersion: 2, audioVersion: 1, audioUrl: 'https://audio.example/old.mp3',
      audioStoragePath: 'old.mp3', approvedAudioVersion: 1,
      audioGenerationStatus: 'idle' as const, audioGenerationAttemptId: null,
      updatedAt: new Date(), generationError: null,
    });
    const topic = Object.assign(new PodcastTopicEntity(), { id: 'topic', targetLanguage: 'de' });
    const speaker = Object.assign(new PodcastSpeakerEntity(), {
      id: 'speaker', episodeId: 'episode', voiceGender: 'female' as const,
      voiceId: 'saved-voice', position: 0,
    });
    const turn = Object.assign(new PodcastTurnEntity(), {
      id: 'turn', episodeId: 'episode', speakerId: 'speaker', targetText: 'Hallo', position: 0,
    });
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      findOne: jest.fn().mockResolvedValue(episode),
      findOneBy: jest.fn().mockResolvedValue(topic),
      find: jest.fn((entity: typeof PodcastTurnEntity | typeof PodcastSpeakerEntity) =>
        Promise.resolve(entity === PodcastTurnEntity ? [turn] : [speaker])),
      save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => Promise<unknown>) => callback(manager)),
      getRepository: jest.fn(() => ({ update })),
    };
    const voices = { resolveVoiceIds: jest.fn().mockRejectedValue(new Error('Provider unavailable')) };
    const storage = { upload: jest.fn(), delete: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [PodcastAudioGenerationService,
        { provide: DataSource, useValue: dataSource },
        { provide: ElevenLabsDialogueAdapter, useValue: voices },
        { provide: StorageService, useValue: storage },
        { provide: AdminPodcastsService, useValue: {} },
      ],
    }).compile();
    const service = module.get(PodcastAudioGenerationService);

    await expect(service.generate('episode')).rejects.toThrow('Provider unavailable');
    expect(voices.resolveVoiceIds).toHaveBeenCalled();
    expect(episode.status).toBe('ready_for_review');
    expect(episode.audioUrl).toBe('https://audio.example/old.mp3');
    expect(episode.approvedAudioVersion).toBe(1);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'episode', contentVersion: 2 }),
      expect.objectContaining({ audioGenerationStatus: 'failed', generationError: 'Provider unavailable' }),
    );
  });
  it('sends delivery cues to synthesis but aligns and stores clean learner words', async () => {
    const episode = Object.assign(new PodcastEpisodeEntity(), {
      id: 'episode', topicId: 'topic', status: 'draft', transcriptFingerprint: 'fingerprint',
      contentVersion: 1, audioVersion: 0, audioGenerationStatus: 'idle', updatedAt: new Date(),
    });
    const topic = Object.assign(new PodcastTopicEntity(), { id: 'topic', targetLanguage: 'de' });
    const speaker = Object.assign(new PodcastSpeakerEntity(), {
      id: 'speaker', voiceGender: 'female', voiceId: 'voice', position: 0,
    });
    const turn = Object.assign(new PodcastTurnEntity(), {
      id: 'turn', speakerId: 'speaker', targetText: 'Hallo', audioTags: ['warm'], position: 0,
    });
    const manager = {
      findOne: jest.fn().mockResolvedValue(episode), findOneBy: jest.fn().mockResolvedValue(topic),
      find: jest.fn(entity => Promise.resolve(entity === PodcastTurnEntity ? [turn] : [speaker])),
      save: jest.fn(value => Promise.resolve(value)),
    };
    const audio = Buffer.from('audio');
    const provider = {
      resolveVoiceIds: jest.fn().mockResolvedValue(['voice']),
      generate: jest.fn().mockResolvedValue({ audio,
        alignment: { characters: ['H'], characterStartTimesSeconds: [0], characterEndTimesSeconds: [1] },
        voiceSegments: [{ startTimeSeconds: 0, endTimeSeconds: 1 }],
      }),
      alignAudio: jest.fn().mockResolvedValue([{ text: 'Hallo', startTimeSeconds: 0.1, endTimeSeconds: 1 }]),
    };
    const service = new PodcastAudioGenerationService({
      transaction: (callback: (value: typeof manager) => Promise<unknown>) => callback(manager),
    } as unknown as DataSource, provider as unknown as ElevenLabsDialogueAdapter, {
      upload: jest.fn().mockResolvedValue('https://audio.example/new.mp3'), delete: jest.fn(),
    } as unknown as StorageService, {} as AdminPodcastsService);
    await service.generate('episode');
    expect(provider.generate).toHaveBeenCalledWith([{ text: '[warm] Hallo', voiceId: 'voice' }], 'de');
    expect(provider.alignAudio).toHaveBeenCalledWith(audio, 'Hallo', undefined);
    expect(turn.targetText).toBe('Hallo');
    expect(turn.wordTimings.map(word => word.text)).toEqual(['Hallo']);
    expect(episode.status).toBe('ready_for_review');
  });

});
