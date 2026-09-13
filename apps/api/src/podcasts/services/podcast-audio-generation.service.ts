import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import type { AdminGeneratePodcastAudioResult, AdminPodcastEpisodeListItem, LanguageCode } from '@lingua-card/shared/domain';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import {
  dialogueDurationMs, normalizeForcedAlignmentTimings,
} from '../domain/podcast-timing';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { ElevenLabsDialogueAdapter } from '../infrastructure/elevenlabs-dialogue.adapter';
import { AdminPodcastsService } from './admin-podcasts.service';

interface GenerationSnapshot {
  episode: PodcastEpisodeEntity;
  topic: PodcastTopicEntity;
  turns: PodcastTurnEntity[];
  speakers: PodcastSpeakerEntity[];
  attemptId: string;
}

@Injectable()
export class PodcastAudioGenerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly elevenLabs: ElevenLabsDialogueAdapter,
    private readonly storage: StorageService,
    private readonly podcasts: AdminPodcastsService,
  ) {}

  async recast(episodeId: string): Promise<AdminPodcastEpisodeListItem> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    if (episode.status === 'published' || episode.status === 'queued' || episode.status === 'generating'
      || episode.audioGenerationStatus === 'generating') {
      throw new ConflictException('Voices cannot be changed during generation or after publication');
    }
    if (!episode.transcriptFingerprint) throw new ConflictException('Prepare a transcript before choosing voices');
    const [topic, speakers] = await Promise.all([
      this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId }),
      this.dataSource.getRepository(PodcastSpeakerEntity).find({
        where: { episodeId }, order: { position: 'ASC' },
      }),
    ]);
    if (!topic || !speakers.length) throw new ConflictException('The podcast transcript is incomplete');
    const oldVoiceIds = speakers.map(speaker => speaker.voiceId);
    const newVoiceIds = await this.elevenLabs.resolveVoiceIds(
      speakers.map(speaker => ({ gender: speaker.voiceGender, voiceId: '' })),
      topic.targetLanguage, oldVoiceIds,
    );
    if (newVoiceIds.every((voiceId, position) => voiceId === oldVoiceIds[position])) {
      throw new ConflictException('Add more eligible voices before choosing a new cast');
    }
    const oldPath = await this.dataSource.transaction(async manager => {
      const current = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.contentVersion !== episode.contentVersion
        || current.audioVersion !== episode.audioVersion
        || current.status === 'published' || current.status === 'queued' || current.status === 'generating'
        || current.audioGenerationStatus === 'generating') {
        throw new ConflictException('The episode changed while voices were being selected');
      }
      const currentSpeakers = await manager.find(PodcastSpeakerEntity, {
        where: { episodeId }, order: { position: 'ASC' },
      });
      if (currentSpeakers.length !== newVoiceIds.length) {
        throw new ConflictException('The transcript speakers changed while voices were being selected');
      }
      for (const [position, speaker] of currentSpeakers.entries()) {
        speaker.voiceId = newVoiceIds[position];
      }
      await manager.save(currentSpeakers);
      const previousPath = current.audioStoragePath;
      current.audioUrl = null;
      current.audioStoragePath = null;
      current.audioDurationMs = 0;
      current.approvedAudioVersion = null;
      current.audioGenerationStatus = 'idle';
      current.generationError = null;
      current.status = 'draft';
      await manager.save(current);
      await manager.update(PodcastTurnEntity, { episodeId }, {
        startMs: null, endMs: null, wordTimings: [],
      });
      return previousPath;
    });
    if (oldPath) {
      try { await this.storage.delete(oldPath); } catch { /* The recast is already committed. */ }
    }
    return this.podcasts.findEpisodeModel(episodeId);
  }

  async generate(episodeId: string): Promise<AdminGeneratePodcastAudioResult> {
    const snapshot = await this.claimGeneration(episodeId);
    let uploadedPath: string | null = null;
    try {
      const speakerById = new Map(snapshot.speakers.map(speaker => [speaker.id, speaker]));
      const recentVoiceIds = snapshot.speakers.some(speaker => !speaker.voiceId)
        ? await this.mostRecentVoiceIds(snapshot.topic.targetLanguage, episodeId) : [];
      const automaticallyAssignedVoiceIds = await this.elevenLabs.resolveVoiceIds(
        snapshot.speakers.map(speaker => ({ gender: speaker.voiceGender, voiceId: speaker.voiceId })),
        snapshot.topic.targetLanguage,
        recentVoiceIds,
      );
      await this.persistVoiceAssignment(snapshot, automaticallyAssignedVoiceIds);
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
      if (uploadedPath) {
        try { await this.storage.delete(uploadedPath); } catch { /* Preserve the provider error. */ }
      }
      await this.markFailed(episodeId, snapshot.episode.contentVersion, snapshot.attemptId, error);
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
      const generationIsActive = episode.audioGenerationStatus === 'generating'
        && episode.updatedAt.getTime() > Date.now() - 5 * 60 * 1000;
      if (generationIsActive || episode.status === 'queued' || episode.status === 'generating') {
        throw new ConflictException('Podcast audio generation is already in progress');
      }
      const [topic, turns, speakers] = await Promise.all([
        manager.findOneBy(PodcastTopicEntity, { id: episode.topicId }),
        manager.find(PodcastTurnEntity, { where: { episodeId }, order: { position: 'ASC' } }),
        manager.find(PodcastSpeakerEntity, { where: { episodeId }, order: { position: 'ASC' } }),
      ]);
      if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
      if (!turns.length || !speakers.length) throw new ConflictException('The episode transcript is incomplete');
      const attemptId = randomUUID();
      episode.audioGenerationStatus = 'generating';
      episode.audioGenerationAttemptId = attemptId;
      episode.generationError = null;
      await manager.save(episode);
      return { episode, topic, turns, speakers, attemptId };
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
      if (episode.contentVersion !== snapshot.episode.contentVersion
        || episode.audioGenerationAttemptId !== snapshot.attemptId
        || episode.audioGenerationStatus !== 'generating' || episode.status === 'published') {
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
      episode.approvedAudioVersion = null;
      episode.status = 'ready_for_review';
      episode.audioGenerationStatus = 'idle';
      episode.audioGenerationAttemptId = null;
      episode.generationError = null;
      await manager.save(episode);
      return oldPath;
    });
    if (previousPath && previousPath !== storagePath) {
      try {
        await this.storage.delete(previousPath);
      } catch {
        // The new version is committed; storage cleanup must not report generation failure.
      }
    }
    return {
      episodeId: snapshot.episode.id, status: 'ready_for_review', audioUrl,
      audioDurationMs: durationMs, audioVersion: snapshot.episode.audioVersion + 1,
      turnCount: snapshot.turns.length,
    };
  }

  private async markFailed(
    episodeId: string,
    contentVersion: number,
    attemptId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Audio generation failed';
    await this.dataSource.getRepository(PodcastEpisodeEntity).update(
      { id: episodeId, contentVersion, audioGenerationAttemptId: attemptId },
      { audioGenerationStatus: 'failed', audioGenerationAttemptId: null,
        generationError: message.slice(0, 1000) },
    );
  }

  private async persistVoiceAssignment(
    snapshot: GenerationSnapshot,
    voiceIds: readonly string[],
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: snapshot.episode.id }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode || episode.audioGenerationAttemptId !== snapshot.attemptId
        || episode.contentVersion !== snapshot.episode.contentVersion) {
        throw new ConflictException('The episode changed during voice assignment');
      }
      for (const speaker of snapshot.speakers) {
        speaker.voiceId = voiceIds[speaker.position] ?? '';
      }
      await manager.save(snapshot.speakers);
    });
  }

  private async mostRecentVoiceIds(languageCode: LanguageCode, episodeId: string): Promise<string[]> {
    const topics = await this.dataSource.getRepository(PodcastTopicEntity).find({
      where: { targetLanguage: languageCode }, select: { id: true },
    });
    if (!topics.length) return [];
    const previous = await this.dataSource.getRepository(PodcastEpisodeEntity).findOne({
      where: { id: Not(episodeId), topicId: In(topics.map(topic => topic.id)),
        audioUrl: Not(IsNull()) },
      order: { updatedAt: 'DESC' },
    });
    if (!previous) return [];
    const speakers = await this.dataSource.getRepository(PodcastSpeakerEntity).find({
      where: { episodeId: previous.id }, order: { position: 'ASC' },
    });
    return speakers.map(speaker => speaker.voiceId);
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
