import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  createNewReviewSchedulingState,
  type CardView,
  type CollectionSummaryView,
  type CursorPage,
  type LanguageCode,
  type VaultView,
} from '@lingua-card/shared/domain';
import type {
  CollectionSummaryRow,
  LearningItemCursor,
  LearningItemReadRow,
} from '../models/learning-item-read.models';
import {
  LEARNING_ITEM_READ_REPOSITORY,
  type LearningItemReadPort,
} from '../repositories/learning-item-read.repository';

export interface ListLearningItemsRequest {
  userId: string;
  learningContextId: string;
  collectionId?: string;
  query?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class LearningItemReadService {
  constructor(
    @Inject(LEARNING_ITEM_READ_REPOSITORY)
    private readonly repository: LearningItemReadPort,
  ) {}

  async listLearningItems(request: ListLearningItemsRequest): Promise<CursorPage<CardView>> {
    await this.requireLearningContext(request.userId, request.learningContextId);
    const cursor = request.cursor ? this.decodeCursor(request.cursor) : undefined;
    const rows = await this.repository.findLearningItems({
      ...request,
      cursor,
      limit: request.limit + 1,
    });
    const hasNextPage = rows.length > request.limit;
    const pageRows = hasNextPage ? rows.slice(0, request.limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
      items: pageRows.map(row => this.toCardView(row)),
      nextCursor: hasNextPage && lastRow
        ? this.encodeCursor({ createdAt: this.toIso(lastRow.createdAt), id: lastRow.id })
        : null,
    };
  }

  async loadVault(userId: string, learningContextId: string): Promise<VaultView> {
    const context = await this.requireLearningContext(userId, learningContextId);
    const [stats, collectionRows, availableCount] = await Promise.all([
      this.repository.loadLearningItemStats(userId, learningContextId),
      this.repository.findCollectionSummaries(userId, learningContextId),
      this.repository.countPublishedPlatformCollections(context.sourceLanguage, context.targetLanguage),
    ]);

    return {
      learningContext: {
        id: context.id,
        sourceLanguage: this.toLanguageCode(context.sourceLanguage),
        targetLanguage: this.toLanguageCode(context.targetLanguage),
        isActive: context.isActive,
      },
      allWords: {
        itemCount: stats.itemCount,
        dueCount: stats.dueCount,
        masteredPercentage: stats.itemCount > 0
          ? Math.round((stats.masteredCount / stats.itemCount) * 100)
          : 0,
      },
      collections: collectionRows.map(row => this.toCollectionSummary(row)),
      platformCollections: { availableCount },
    };
  }

  async loadActiveLearningContext(userId: string) {
    const context = await this.repository.ensureActiveLearningContext(userId);
    return {
      id: context.id,
      sourceLanguage: this.toLanguageCode(context.sourceLanguage),
      targetLanguage: this.toLanguageCode(context.targetLanguage),
      isActive: context.isActive,
    };
  }

  private async requireLearningContext(userId: string, learningContextId: string) {
    const context = await this.repository.findLearningContext(userId, learningContextId);
    if (!context) throw new NotFoundException(`Learning context ${learningContextId} not found`);
    return context;
  }

  private toCardView(row: LearningItemReadRow): CardView {
    const reviewState = row.reviewState ?? createNewReviewSchedulingState(row.id);
    return {
      id: row.id,
      learningContextId: row.learningContextId,
      sourceLanguage: this.toLanguageCode(row.sourceLanguage),
      targetLanguage: this.toLanguageCode(row.targetLanguage),
      lexeme: {
        id: row.lexemeId,
        text: row.lexemeText,
        partOfSpeech: row.partOfSpeech,
        grammar: row.grammar,
        phonetic: row.phonetic,
      },
      localization: {
        language: this.toLanguageCode(row.localizationLanguage),
        translation: row.translation,
        definition: row.definition,
      },
      examples: row.examples,
      personalNote: row.personalNote,
      reviewState: { ...reviewState, cardId: row.id },
      collectionIds: row.collectionIds,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
    };
  }

  private toCollectionSummary(row: CollectionSummaryRow): CollectionSummaryView {
    return {
      ...row,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
    };
  }

  private encodeCursor(cursor: LearningItemCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): LearningItemCursor {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (!this.isRecord(parsed)) throw new Error('Cursor payload must be an object');
      const createdAt = parsed['createdAt'];
      const id = parsed['id'];
      if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
        throw new Error('Cursor date is invalid');
      }
      if (typeof id !== 'string' || id.length === 0) throw new Error('Cursor ID is invalid');
      return { createdAt, id };
    } catch {
      throw new BadRequestException('Invalid learning-items cursor');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toLanguageCode(value: string): LanguageCode {
    switch (value) {
      case 'en':
      case 'de':
      case 'fr':
      case 'es':
      case 'it':
      case 'pt':
      case 'ja':
      case 'zh':
      case 'ko':
      case 'ar':
      case 'uk':
      case 'tr':
      case 'ru':
        return value;
      default:
        throw new Error(`Unsupported language code in persisted learning context: ${value}`);
    }
  }
}
