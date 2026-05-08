import { Injectable, NotFoundException } from '@nestjs/common';
import type { Collection } from '@lingua-card/shared/domain';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/dto';
import { randomUUID } from 'crypto';

@Injectable()
export class CollectionsService {
  private collections: Collection[] = [];

  findAll(): Collection[] {
    return this.collections;
  }

  findOne(id: string): Collection {
    const col = this.collections.find(c => c.id === id);
    if (!col) throw new NotFoundException(`Collection ${id} not found`);
    return col;
  }

  create(dto: CreateCollectionDto): Collection {
    const now = new Date().toISOString();
    const collection: Collection = {
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
      createdAt: now,
      updatedAt: now,
      isDefault: false,
    };
    this.collections.push(collection);
    return collection;
  }

  update(id: string, dto: UpdateCollectionDto): Collection {
    const index = this.collections.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Collection ${id} not found`);
    this.collections[index] = {
      ...this.collections[index],
      ...dto,
      updatedAt: new Date().toISOString(),
    };
    return this.collections[index];
  }

  remove(id: string): void {
    const index = this.collections.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Collection ${id} not found`);
    this.collections.splice(index, 1);
  }
}
