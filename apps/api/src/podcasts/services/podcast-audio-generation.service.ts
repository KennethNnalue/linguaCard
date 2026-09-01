import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import type { AdminGeneratePodcastAudioResult } from '@lingua-card/shared/domain';
import { DataSource } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import {
  dialogueDurationMs, normalizeForcedAlignmentTimings,
} from '../domain/podcast-timing';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { ElevenLabsDialogueAdapter } from '../infrastructure/elevenlabs-dialogue.adapter';

interface GenerationSnapshot {
  episode: PodcastEpisodeEntity;
  topic: PodcastTopicEntity;
  turns: PodcastTurnEntity[];
  speakers: PodcastSpeakerEntity[];
}

@Injectable()
export class PodcastAudioGenerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly elevenLabs: ElevenLabsDialogueAdapter,
    private readonly storage: StorageService,
  ) {}

  async generate(episodeId: string): Promise<AdminGeneratePodcastAudioResult> {
    const snapshot = await this.claimGeneration(episodeId);
    let uploadedPath: string | null = null;
    try {
      const speakerById = new Map(snapshot.speakers.map(speaker => [speaker.id, speaker]));
      const automaticallyAssignedVoiceIds = await this.elevenLabs.resolveVoiceIds(
        snapshot.speakers.map(speaker => speaker.voiceGender),
      );
      const inputs = snapshot.turns.map(turn => ({
        text: turn.targetText,
        voiceId: automaticallyAssignedVoiceIds[
          this.requireSpeaker(speakerById, turn.speakerId).position
        ],
      }));
      const totalCharacters = inputs.reduce((total, input) => total + input.text.length, 0);
      if (totalCharacters > 2_000) {
        throw new BadRequestException('ElevenLabs dialogue input must not exceed 2,000 characters');
      }
      const generated = await this.elevenLabs.generate(inputs, snapshot.topic.targetLanguage);
      const alignedWords = await this.elevenLabs.alignAudio(
        generated.audio, inputs.map(input => input.text).join('\n'),
      );
      const timings = normalizeForcedAlignmentTimings(
        inputs.map(input => input.text), alignedWords,
      );
      if (timings.length !== snapshot.turns.length) {
        throw new ConflictException('ElevenLabs did not return timing data for every dialogue turn');
      }
      const durationMs = Math.max(
        dialogueDurationMs(generated.alignment, generated.voiceSegments),
        timings.at(-1)?.endMs ?? 0,
      );
      if (durationMs <= 0 || durationMs > 300_000) {
        throw new ConflictException('Generated podcast audio must be between zero and five minutes');
      }
      const fingerprint = snapshot.episode.transcriptFingerprint;
      if (!fingerprint) throw new ConflictException('The episode transcript is missing its fingerprint');
      uploadedPath = this.storagePath(
        snapshot.episode.id, snapshot.episode.contentVersion,
        snapshot.episode.audioVersion + 1, fingerprint,
      );
      const audioUrl = await this.storage.upload(generated.audio, uploadedPath, 'audio/mpeg');
      const result = await this.commitGeneration(snapshot, timings, uploadedPath, audioUrl, durationMs);
      uploadedPath = null;
      return result;
    } catch (error) {
      if (uploadedPath) await this.storage.delete(uploadedPath);
      await this.markFailed(
        episodeId, snapshot.episode.contentVersion,
        snapshot.episode.audioUrl ? 'ready_for_review' : 'failed', error,
      );
      throw error;
    }
  }

  private async claimGeneration(episodeId: string): Promise<GenerationSnapshot> {
    return this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
      if (episode.status === 'published') {
        throw new ConflictException('Published episodes cannot be regenerated while they are live');
      }
      if (!episode.transcriptFingerprint) throw new ConflictException('Import a valid transcript before generating audio');
      if (!episode.thumbnailAssetId) throw new ConflictException('Upload an episode thumbnail before generating audio');
      const generationIsActive = episode.status === 'generating'
        && episode.updatedAt.getTime() > Date.now() - 5 * 60 * 1000;
      if (generationIsActive || episode.status === 'queued') {
        throw new ConflictException('Podcast audio generation is already in progress');
      }
      const [topic, turns, speakers] = await Promise.all([
        manager.findOneBy(PodcastTopicEntity, { id: episode.topicId }),
        manager.find(PodcastTurnEntity, { where: { episodeId }, order: { position: 'ASC' } }),
        manager.find(PodcastSpeakerEntity, { where: { episodeId }, order: { position: 'ASC' } }),
      ]);
      if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
      if (!turns.length || !speakers.length) throw new ConflictException('The episode transcript is incomplete');
      episode.status = 'generating';
      episode.generationError = null;
      await manager.save(episode);
      return { episode, topic, turns, speakers };
    });
  }

  private async commitGeneration(
    snapshot: GenerationSnapshot,
    timings: ReturnType<typeof normalizeForcedAlignmentTimings>,
    storagePath: string,
    audioUrl: string,
    durationMs: number,
  ): Promise<AdminGeneratePodcastAudioResult> {
    const previousPath = await this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: snapshot.episode.id }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode) throw new NotFoundException(`Podcast episode ${snapshot.episode.id} not found`);
      if (episode.contentVersion !== snapshot.episode.contentVersion || episode.status !== 'generating') {
        throw new ConflictException('The transcript changed while audio was being generated');
      }
      for (const timing of timings) {
        const turn = snapshot.turns[timing.turnIndex];
        turn.startMs = timing.startMs;
        turn.endMs = timing.endMs;
        turn.wordTimings = timing.words;
      }
      await manager.save(snapshot.turns);
      const oldPath = episode.audioStoragePath;
      episode.audioUrl = audioUrl;
      episode.audioStoragePath = storagePath;
      episode.audioDurationMs = durationMs;
      episode.audioVersion += 1;
      episode.status = 'ready_for_review';
      episode.generationError = null;
      await manager.save(episode);
      return oldPath;
    });
    if (previousPath && previousPath !== storagePath) await this.storage.delete(previousPath);
    return {
      episodeId: snapshot.episode.id, status: 'ready_for_review', audioUrl,
      audioDurationMs: durationMs, audioVersion: snapshot.episode.audioVersion + 1,
      turnCount: snapshot.turns.length,
    };
  }

  private async markFailed(
    episodeId: string,
    contentVersion: number,
    status: 'ready_for_review' | 'failed',
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Audio generation failed';
    await this.dataSource.getRepository(PodcastEpisodeEntity).update(
      { id: episodeId, contentVersion },
      { status, generationError: message.slice(0, 1000) },
    );
  }

  private requireSpeaker(
    speakerById: ReadonlyMap<string, PodcastSpeakerEntity>,
    speakerId: string,
  ): PodcastSpeakerEntity {
    const speaker = speakerById.get(speakerId);
    if (!speaker) throw new ConflictException(`Transcript speaker ${speakerId} is missing`);
    return speaker;
  }

  private storagePath(
    episodeId: string, contentVersion: number, audioVersion: number, fingerprint: string,
  ): string {
    return `podcasts/${episodeId}/content-${contentVersion}-audio-${audioVersion}-${fingerprint.slice(0, 12)}.mp3`;
  }
}
