import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Card, CardContent, GenderType } from '@lingua-card/shared/domain';
import type { CreateCardDto, UpdateCardDto, CardQueryParams } from '@lingua-card/shared/dto';
import { CardEntity } from './card.entity';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly repo: Repository<CardEntity>,
  ) {}

  async findAll(query: CardQueryParams): Promise<Card[]> {
    const qb = this.repo.createQueryBuilder('card');
    if (query.collectionId) qb.andWhere('card.collectionId = :collectionId', { collectionId: query.collectionId });
    if (query.categoryId)   qb.andWhere(':categoryId = ANY(card.categoryIds)', { categoryId: query.categoryId });
    if (query.state)        qb.andWhere("card.srsState->>'state' = :state", { state: query.state });
    return (await qb.getMany()).map(this.toModel);
  }

  async findOne(id: string): Promise<Card> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    return this.toModel(entity);
  }

  async create(dto: CreateCardDto): Promise<Card> {
    const now = new Date().toISOString();
    const entity = this.repo.create({
      id: randomUUID(),
      deckId: dto.deckId,
      collectionId: dto.collectionId ?? null,
      userId: dto.userId,
      contextId: dto.contextId,
      content: {
        front: dto.content.front,
        back: dto.content.back,
        article: dto.content.article ?? null,
        gender: (dto.content.gender ?? null) as GenderType,
        examples: (dto.content.examples ?? []).map(e => ({ id: randomUUID(), ...e })),
        notes: dto.content.notes ?? '',
        audioAssetId: dto.content.audioAssetId ?? null,
        imageUrl: dto.content.imageUrl ?? null,
        phonetic: dto.content.phonetic ?? null,
      } satisfies CardContent,
      categoryIds: dto.categoryIds ?? [],
      tags: dto.tags ?? [],
      version: 1,
      srsState: null,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async update(id: string, dto: UpdateCardDto): Promise<Card> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Card ${id} not found`);
    if (dto.content)      entity.content    = { ...entity.content, ...dto.content } as CardContent;
    if (dto.categoryIds)  entity.categoryIds = dto.categoryIds;
    if (dto.tags)         entity.tags        = dto.tags;
    if (dto.collectionId !== undefined) entity.collectionId = dto.collectionId ?? null;
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Card ${id} not found`);
  }

  private toModel(e: CardEntity): Card {
    return {
      id: e.id,
      deckId: e.deckId,
      collectionId: e.collectionId,
      userId: e.userId,
      contextId: e.contextId,
      content: e.content,
      categoryIds: e.categoryIds,
      tags: e.tags,
      version: e.version,
      srsState: e.srsState ?? undefined,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
