import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { AiConfig } from '../../config/ai.config';
import { SpeechIdentityService } from '../domain/speech-identity.service';
import { stableResourceId } from '../domain/stable-resource-id';
import { SpeechAssetEntity } from '../entities/speech-asset.entity';
import type { LegacySpeechAssetProjectionInput } from '../models/vocabulary.types';

@Injectable()
export class LegacySpeechAssetProjectionService {
  private readonly voiceKey: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly speechIdentity: SpeechIdentityService,
    config: ConfigService,
  ) {
    this.voiceKey = config.get<AiConfig>('ai')?.googleCloudTtsVoice
      || 'de-DE-Chirp3-HD-Charon';
  }

  async project(input: LegacySpeechAssetProjectionInput): Promise<void> {
    const identity = this.speechIdentity.createIdentity({
      language: input.language,
      text: input.text,
      voiceKey: this.voiceKey,
      profileVersion: 1,
      contentKind: 'word',
    });
    const repo = this.dataSource.getRepository(SpeechAssetEntity);
    const id = stableResourceId('speech-asset', identity.identityKey);
    await repo.upsert({
      id,
      identityKey: identity.identityKey,
      language: identity.language,
      normalizedText: identity.normalizedText,
      displayText: identity.displayText,
      voiceKey: identity.voiceKey,
      profileVersion: identity.profileVersion,
      contentKind: identity.contentKind,
      status: input.status,
      leaseOwner: null,
      leaseExpiresAt: null,
      attemptCount: input.status === 'failed' ? 1 : 0,
      nextRetryAt: input.failedAt,
      audioUrl: input.audioUrl,
      storagePath: input.storagePath,
      mimeType: input.storagePath?.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      durationMs: input.durationMs,
      checksum: null,
      failureReason: input.status === 'failed' ? 'legacy_generation_failed' : null,
    }, {
      conflictPaths: ['identityKey'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
