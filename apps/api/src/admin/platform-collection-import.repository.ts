import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { LanguageEntity } from '../vocabulary/entities/language.entity';
import { LexemeEntity } from '../vocabulary/entities/lexeme.entity';
import { LexemeLocalizationEntity } from '../vocabulary/entities/lexeme-localization.entity';
import { SpeechAssetEntity } from '../vocabulary/entities/speech-asset.entity';
import { PlatformCollectionEntity } from './platform-collection.entity';
import { PlatformCollectionWordEntity } from './platform-collection-word.entity';
import { PlatformCollectionImportEntity } from './platform-collection-import.entity';
import type { AdminPlatformCollectionImportPayload } from '@lingua-card/shared/domain';

export interface CommitPlatformCollectionInput {
  collection: Omit<PlatformCollectionEntity, 'createdAt' | 'updatedAt' | 'publishedAt'>;
  items: Array<Omit<PlatformCollectionWordEntity, 'createdAt'>>;
  importRecord: PlatformCollectionImportEntity;
}

@Injectable()
export class PlatformCollectionImportRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PlatformCollectionImportEntity)
    private readonly imports: Repository<PlatformCollectionImportEntity>,
    @InjectRepository(LanguageEntity)
    private readonly languages: Repository<LanguageEntity>,
    @InjectRepository(LexemeEntity)
    private readonly lexemes: Repository<LexemeEntity>,
    @InjectRepository(LexemeLocalizationEntity)
    private readonly localizations: Repository<LexemeLocalizationEntity>,
    @InjectRepository(SpeechAssetEntity)
    private readonly speechAssets: Repository<SpeechAssetEntity>,
    @InjectRepository(PlatformCollectionEntity)
    private readonly platformCollections: Repository<PlatformCollectionEntity>,
  ) {}

  findImportByFingerprint(fingerprint: string): Promise<PlatformCollectionImportEntity | null> {
    return this.imports.findOneBy({ fingerprint });
  }

  findImportById(id: string): Promise<PlatformCollectionImportEntity | null> {
    return this.imports.findOneBy({ id });
  }

  findImportsInProgress(): Promise<PlatformCollectionImportEntity[]> {
    return this.imports.findBy({ status: 'importing' });
  }

  saveImport(record: PlatformCollectionImportEntity): Promise<PlatformCollectionImportEntity> {
    return this.imports.save(record);
  }

  async claimImport(
    fingerprint: string,
    title: string,
    payload: AdminPlatformCollectionImportPayload,
  ): Promise<PlatformCollectionImportEntity> {
    await this.imports.createQueryBuilder().insert().values({
      id: randomUUID(), fingerprint, status: 'ready_to_import', collectionId: null, title,
      inserted: 0, reused: 0, audioLinked: 0, error: null, stage: 'queued',
      processedItems: 0, totalItems: 0, rowErrors: [], payload,
    }).orIgnore().execute();
    return this.imports.findOneByOrFail({ fingerprint });
  }

  findImportPayload(id: string): Promise<PlatformCollectionImportEntity | null> {
    return this.imports.findOneBy({ id });
  }

  async tryStartImport(
    record: PlatformCollectionImportEntity,
    totalItems: number,
    staleBefore: Date,
  ): Promise<boolean> {
    const result = await this.imports.createQueryBuilder()
      .update()
      .set({
        status: 'importing', error: null, stage: 'resolve_vocabulary', processedItems: 0,
        totalItems, rowErrors: [],
      })
      .where('id = :id', { id: record.id })
      .andWhere('(status IN (:...restartable) OR (status = :importing AND "updatedAt" < :staleBefore))', {
        restartable: ['ready_to_import', 'failed'],
        importing: 'importing',
        staleBefore,
      })
      .execute();
    return Boolean(result.affected);
  }

  findLanguages(codes: readonly string[]): Promise<LanguageEntity[]> {
    return this.languages.findBy({ code: In([...codes]) });
  }

  findLanguage(code: string): Promise<LanguageEntity> {
    return this.languages.findOneByOrFail({ code });
  }

  findLexemes(language: string, normalizedLemmas: readonly string[]): Promise<LexemeEntity[]> {
    if (!normalizedLemmas.length) return Promise.resolve([]);
    return this.lexemes.find({ where: { language, normalizedLemma: In([...normalizedLemmas]) } });
  }

  findActiveLocalizations(lexemeIds: readonly string[], language: string): Promise<LexemeLocalizationEntity[]> {
    if (!lexemeIds.length) return Promise.resolve([]);
    return this.localizations.find({ where: { lexemeId: In([...lexemeIds]), language, isActive: true } });
  }

  async findReadySpeechIdentityKeys(identityKeys: readonly string[]): Promise<Set<string>> {
    if (!identityKeys.length) return new Set();
    const rows = await this.speechAssets.find({
      select: { identityKey: true },
      where: { identityKey: In([...identityKeys]), status: 'ready' },
    });
    return new Set(rows.map(row => row.identityKey));
  }

  findCollectionByExternalId(externalId: string): Promise<PlatformCollectionEntity | null> {
    return this.platformCollections.findOneBy({ externalId });
  }

  async commitCollection(input: CommitPlatformCollectionInput): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.getRepository(PlatformCollectionEntity).save(input.collection);
      await manager.getRepository(PlatformCollectionWordEntity).save(input.items);
      await manager.getRepository(PlatformCollectionImportEntity).save(input.importRecord);
    });
  }
}
