import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  AdminCommitPodcastTranscriptResult, AdminPodcastTranscriptConflict,
  AdminPodcastTranscriptPreview, AdminPodcastVocabularyResolution,
} from '@lingua-card/shared/domain';
import { DataSource, In } from 'typeorm';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { LexemeEntity } from '../../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../../vocabulary/entities/lexeme-localization.entity';
import { CommitPodcastTranscriptDto, PodcastTranscriptPayloadDto } from '../dto/admin-podcast.dto';
import { PodcastEpisodeVocabularyEntity } from '../entities/podcast-episode-vocabulary.entity';
import { PodcastEpisodeEntity } from '../entities/podcast-episode.entity';
import { PodcastSpeakerEntity } from '../entities/podcast-speaker.entity';
import { PodcastTopicEntity } from '../entities/podcast-topic.entity';
import { PodcastTurnEntity } from '../entities/podcast-turn.entity';
import { StorageService } from '../../storage/storage.service';
import { LegacyVocabularyProjectionService } from '../../vocabulary/services/legacy-vocabulary-projection.service';

interface ResolvedTranscript {
  preview: AdminPodcastTranscriptPreview;
  lexemeByKey: Map<string, string>;
}

export function estimatePodcastDuration(payload: PodcastTranscriptPayloadDto): number {
  const words = payload.turns.reduce(
    (sum, turn) => sum + turn.targetText.trim().split(/\s+/u).length, 0,
  );
  return Math.round(words * (60_000 / 130) + Math.max(0, payload.turns.length - 1) * 350);
}

export function podcastTranscriptFingerprint(payload: PodcastTranscriptPayloadDto): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

@Injectable()
export class PodcastTranscriptImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lexemeIdentity: LexemeIdentityService,
    private readonly vocabularyProjection: LegacyVocabularyProjectionService,
    private readonly storage: StorageService,
  ) {}

  async preview(episodeId: string, payload: PodcastTranscriptPayloadDto): Promise<AdminPodcastTranscriptPreview> {
    return (await this.resolve(episodeId, payload)).preview;
  }

  async commit(episodeId: string, dto: CommitPodcastTranscriptDto): Promise<AdminCommitPodcastTranscriptResult> {
    let resolved = await this.resolve(episodeId, dto.payload);
    if (resolved.preview.fingerprint !== dto.fingerprint) {
      throw new ConflictException('The transcript changed after preview');
    }
    if (resolved.preview.conflicts.length) {
      throw new ConflictException('Resolve transcript conflicts before importing');
    }
    await this.createMissingVocabulary(episodeId, dto.payload, resolved.preview.vocabulary);
    resolved = await this.resolve(episodeId, dto.payload);
    if (resolved.preview.conflicts.length || resolved.lexemeByKey.size !== dto.payload.vocabulary.length) {
      throw new ConflictException('Podcast vocabulary could not be prepared automatically');
    }

    let obsoleteAudioPath: string | null = null;
    await this.dataSource.transaction(async manager => {
      const episode = await manager.findOne(PodcastEpisodeEntity, {
        where: { id: episodeId }, lock: { mode: 'pessimistic_write' },
      });
      if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);

      await manager.delete(PodcastTurnEntity, { episodeId });
      await manager.delete(PodcastEpisodeVocabularyEntity, { episodeId });
      await manager.delete(PodcastSpeakerEntity, { episodeId });

      const speakers = dto.payload.speakers.map((speaker, position) => manager.create(PodcastSpeakerEntity, {
        id: randomUUID(), episodeId, speakerKey: speaker.key, displayName: speaker.name.trim(),
        voiceGender: speaker.voiceGender, voiceId: this.adminSuppliedVoiceId(speaker.voiceId), position,
      }));
      await manager.save(speakers);
      const speakerByKey = new Map(speakers.map(speaker => [speaker.speakerKey, speaker]));
      await manager.save(dto.payload.turns.map((turn, position) => manager.create(PodcastTurnEntity, {
        id: randomUUID(), episodeId,
        speakerId: this.requireMapValue(speakerByKey, turn.speakerKey, 'speaker').id, position,
        targetText: turn.targetText.trim(), translation: turn.translation.trim(),
        vocabularyKeys: [...turn.vocabularyRefs], startMs: null, endMs: null, wordTimings: [],
      })));
      await manager.save(dto.payload.vocabulary.map((item, position) => manager.create(PodcastEpisodeVocabularyEntity, {
        id: randomUUID(), episodeId,
        lexemeId: this.requireMapValue(resolved.lexemeByKey, item.key, 'vocabulary'),
        vocabularyKey: item.key, position, importance: item.importance,
      })));
      episode.transcriptFingerprint = dto.fingerprint;
      if (dto.payload.episode) {
        episode.title = dto.payload.episode.title.trim();
        episode.titleTranslation = dto.payload.episode.titleTranslation.trim();
        episode.description = dto.payload.episode.description.trim();
      }
      episode.estimatedDurationMs = resolved.preview.estimatedDurationMs;
      episode.contentVersion += 1;
      episode.status = 'draft';
      obsoleteAudioPath = episode.audioStoragePath;
      episode.audioUrl = null;
      episode.audioStoragePath = null;
      episode.audioDurationMs = 0;
      episode.audioVersion = 0;
      episode.generationError = null;
      await manager.save(episode);
    });
    if (obsoleteAudioPath) await this.storage.delete(obsoleteAudioPath);

    return {
      episodeId, fingerprint: dto.fingerprint,
      title: dto.payload.episode?.title.trim() ?? this.requireEpisodeMetadata(resolved.preview).title,
      titleTranslation: dto.payload.episode?.titleTranslation.trim()
        ?? this.requireEpisodeMetadata(resolved.preview).titleTranslation,
      description: dto.payload.episode?.description.trim()
        ?? this.requireEpisodeMetadata(resolved.preview).description,
      speakerCount: dto.payload.speakers.length, turnCount: dto.payload.turns.length,
      vocabularyCount: dto.payload.vocabulary.length,
      estimatedDurationMs: resolved.preview.estimatedDurationMs,
    };
  }

  private async resolve(episodeId: string, payload: PodcastTranscriptPayloadDto): Promise<ResolvedTranscript> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);

    const conflicts: AdminPodcastTranscriptConflict[] = [];
    this.validateReferences(payload, conflicts);
    const identities = payload.vocabulary.map(item => this.lexemeIdentity.createIdentity({
      language: topic.targetLanguage, text: item.text,
    }));
    const lemmas = [...new Set(identities.map(identity => identity.normalizedLemma))];
    const lexemes = lemmas.length ? await this.dataSource.getRepository(LexemeEntity).find({
      where: { language: topic.targetLanguage, normalizedLemma: In(lemmas) },
    }) : [];
    const localizations = lexemes.length ? await this.dataSource.getRepository(LexemeLocalizationEntity).find({
      where: { lexemeId: In(lexemes.map(lexeme => lexeme.id)), language: topic.translationLanguage, isActive: true },
    }) : [];
    const localizationByLexeme = new Map(localizations.map(item => [item.lexemeId, item]));
    const lexemeByKey = new Map<string, string>();
    const usedLexemes = new Set<string>();
    const resolutions: AdminPodcastVocabularyResolution[] = payload.vocabulary.map((item, index) => {
      const matches = lexemes.filter(lexeme => lexeme.normalizedLemma === identities[index].normalizedLemma);
      const translationMatches = matches.filter(match =>
        this.normalize(localizationByLexeme.get(match.id)?.translation ?? '')
          === this.normalize(item.translation));
      const matchedLexeme = translationMatches.length === 1
        ? translationMatches[0]
        : matches.length === 1 ? matches[0] : null;
      let status: AdminPodcastVocabularyResolution['status'] = matchedLexeme ? 'resolved' : 'new';
      let lexemeId: string | null = matchedLexeme?.id ?? null;
      if (matches.length > 1 && !matchedLexeme) status = 'ambiguous';
      if (lexemeId && usedLexemes.has(lexemeId)) {
        status = 'ambiguous';
        lexemeId = null;
      } 
      if (lexemeId) {
        lexemeByKey.set(item.key, lexemeId);
        usedLexemes.add(lexemeId);
      } else if (status === 'ambiguous') {
        conflicts.push(this.vocabularyConflict(status, index, item.text));
      }
      return { key: item.key, text: item.text, lexemeId, status };
    });
    const estimatedDurationMs = estimatePodcastDuration(payload);
    if (estimatedDurationMs > 300_000) conflicts.push({
      code: 'duration-limit', pointer: '/turns', severity: 'error',
      message: `Estimated duration is ${Math.ceil(estimatedDurationMs / 60000)} minutes.`,
      remediation: 'Split the conversation into episodes no longer than five minutes.',
    });
    const dialogueCharacters = payload.turns.reduce(
      (total, turn) => total + turn.targetText.length, 0,
    );
    if (dialogueCharacters > 2_000) conflicts.push({
      code: 'provider-limit', pointer: '/turns', severity: 'error',
      message: `The dialogue contains ${dialogueCharacters} characters; the generation limit is 2,000.`,
      remediation: 'Shorten the conversation or split it into multiple episodes.',
    });
    return {
      lexemeByKey,
      preview: {
        episodeId,
        episode: payload.episode ? {
          title: payload.episode.title.trim(),
          titleTranslation: payload.episode.titleTranslation.trim(),
          description: payload.episode.description.trim(),
        } : {
          title: episode.title,
          titleTranslation: episode.titleTranslation,
          description: episode.description,
        },
        fingerprint: podcastTranscriptFingerprint(payload), status: conflicts.length ? 'conflicts' : 'valid',
        counts: { speakers: payload.speakers.length, turns: payload.turns.length,
          vocabulary: payload.vocabulary.length,
          resolvedVocabulary: lexemeByKey.size,
          newVocabulary: resolutions.filter(item => item.status === 'new').length,
        },
        estimatedDurationMs, conflicts, vocabulary: resolutions,
      },
    };
  }

  private validateReferences(payload: PodcastTranscriptPayloadDto, conflicts: AdminPodcastTranscriptConflict[]): void {
    const speakerKeys = new Set<string>();
    for (let index = 0; index < payload.speakers.length; index += 1) {
      const speaker = payload.speakers[index];
      if (speakerKeys.has(speaker.key)) conflicts.push(this.duplicate(`/speakers/${index}/key`, speaker.key));
      speakerKeys.add(speaker.key);
    }
    const vocabularyKeys = new Set<string>();
    for (let index = 0; index < payload.vocabulary.length; index += 1) {
      const item = payload.vocabulary[index];
      if (vocabularyKeys.has(item.key)) conflicts.push(this.duplicate(`/vocabulary/${index}/key`, item.key));
      vocabularyKeys.add(item.key);
    }
    for (let index = 0; index < payload.turns.length; index += 1) {
      const turn = payload.turns[index];
      if (!speakerKeys.has(turn.speakerKey)) conflicts.push({
        code: 'unknown-reference', pointer: `/turns/${index}/speakerKey`, severity: 'error',
        message: `Unknown speaker key “${turn.speakerKey}”.`, remediation: 'Use a key declared in speakers.',
      });
      for (let refIndex = 0; refIndex < turn.vocabularyRefs.length; refIndex += 1) {
        const key = turn.vocabularyRefs[refIndex];
        if (!vocabularyKeys.has(key)) conflicts.push({
          code: 'unknown-reference', pointer: `/turns/${index}/vocabularyRefs/${refIndex}`, severity: 'error',
          message: `Unknown vocabulary key “${key}”.`, remediation: 'Declare the word in vocabulary or remove the reference.',
        });
      }
    }
  }

  private duplicate(pointer: string, key: string): AdminPodcastTranscriptConflict {
    return { code: 'duplicate-key', pointer, severity: 'error', message: `Duplicate key “${key}”.`, remediation: 'Use unique keys within the transcript.' };
  }

  private vocabularyConflict(status: AdminPodcastVocabularyResolution['status'], index: number, text: string): AdminPodcastTranscriptConflict {
    const ambiguous = status === 'ambiguous';
    return {
      code: ambiguous ? 'ambiguous-vocabulary' : 'unresolved-vocabulary',
      pointer: `/vocabulary/${index}`, severity: 'error',
      message: ambiguous
        ? `“${text}” does not identify one unique canonical lexeme.`
        : `“${text}” could not be prepared automatically.`,
      remediation: ambiguous
        ? 'Use a translation that identifies the intended canonical vocabulary entry.'
        : 'Check the word and translation in the transcript.',
    };
  }

  private async createMissingVocabulary(
    episodeId: string,
    payload: PodcastTranscriptPayloadDto,
    resolutions: readonly AdminPodcastVocabularyResolution[],
  ): Promise<void> {
    const episode = await this.dataSource.getRepository(PodcastEpisodeEntity).findOneBy({ id: episodeId });
    if (!episode) throw new NotFoundException(`Podcast episode ${episodeId} not found`);
    const topic = await this.dataSource.getRepository(PodcastTopicEntity).findOneBy({ id: episode.topicId });
    if (!topic) throw new NotFoundException(`Podcast topic ${episode.topicId} not found`);
    const statusByKey = new Map(resolutions.map(item => [item.key, item.status]));
    const newVocabulary = payload.vocabulary.filter(item => statusByKey.get(item.key) === 'new');
    await this.vocabularyProjection.projectMany(newVocabulary.map(item => ({
      input: {
        targetLanguage: topic.targetLanguage,
        sourceLanguage: topic.translationLanguage,
        displayText: item.text,
        article: null,
        gender: null,
        translation: item.translation,
        definition: null,
        partOfSpeech: 'other',
        phonetic: null,
        cefrLevel: episode.level,
        plurals: [],
        examples: [],
        synonyms: [],
        source: 'admin',
        model: 'podcast-transcript-import',
      },
    })));
  }

  private normalize(value: string): string {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  }

  private adminSuppliedVoiceId(voiceId: string | undefined): string {
    const normalized = voiceId?.trim() ?? '';
    return normalized === 'REPLACE_WITH_ELEVENLABS_VOICE_ID' ? '' : normalized;
  }

  private requireMapValue<T>(values: ReadonlyMap<string, T>, key: string, kind: string): T {
    const value = values.get(key);
    if (value === undefined) throw new ConflictException(`Transcript ${kind} “${key}” is unresolved`);
    return value;
  }

  private requireEpisodeMetadata(
    preview: AdminPodcastTranscriptPreview,
  ): NonNullable<AdminPodcastTranscriptPreview['episode']> {
    if (!preview.episode) throw new ConflictException('Transcript episode metadata is missing');
    return preview.episode;
  }
}
