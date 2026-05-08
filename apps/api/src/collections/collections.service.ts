import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Collection } from '@lingua-card/shared/domain';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/dto';
import { CollectionEntity } from './collection.entity';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(CollectionEntity)
    private readonly repo: Repository<CollectionEntity>,
  ) {}

  async findAll(): Promise<Collection[]> {
    return (await this.repo.find()).map(this.toModel);
  }

  async findOne(id: string): Promise<Collection> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Collection ${id} not found`);
    return this.toModel(entity);
  }

  async create(dto: CreateCollectionDto): Promise<Collection> {
    const entity = this.repo.create({
      id: randomUUID(),
      userId: 'user-001',
      name: dto.name,
      description: dto.description ?? '',
      emoji: dto.emoji ?? '📚',
      colour: dto.colour ?? '#2D5A4E',
      contextId: dto.contextId,
      cardCount: 0,
      masteredCount: 0,
      dueCount: 0,
      isDefault: false,
    });
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async update(id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`Collection ${id} not found`);
    Object.assign(entity, dto);
    const saved = await this.repo.save(entity);
    return this.toModel(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Collection ${id} not found`);
  }

  private toModel(e: CollectionEntity): Collection {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      description: e.description,
      emoji: e.emoji,
      colour: e.colour,
      contextId: e.contextId,
      cardCount: e.cardCount,
      masteredCount: e.masteredCount,
      dueCount: e.dueCount,
      isDefault: e.isDefault,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
    };
  }
}
