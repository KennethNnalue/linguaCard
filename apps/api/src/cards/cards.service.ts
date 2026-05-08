import { Injectable, NotFoundException } from '@nestjs/common';
import type { Card } from '@lingua-card/shared/domain';
import type { CreateCardDto, UpdateCardDto, CardQueryParams } from '@lingua-card/shared/dto';
import { randomUUID } from 'crypto';

@Injectable()
export class CardsService {
  private cards: Card[] = [];

  findAll(query: CardQueryParams): Card[] {
    let result = [...this.cards];
    if (query.collectionId) result = result.filter(c => c.collectionId === query.collectionId);
    if (query.categoryId) result = result.filter(c => c.categoryIds.includes(query.categoryId!));
    if (query.state) result = result.filter(c => c.srsState?.state === query.state);
    return result;
  }

  findOne(id: string): Card {
    const card = this.cards.find(c => c.id === id);
    if (!card) throw new NotFoundException(`Card ${id} not found`);
    return card;
  }

  create(dto: CreateCardDto): Card {
    const now = new Date().toISOString();
    const card: Card = {
      id: randomUUID(),
      deckId: dto.deckId,
      collectionId: dto.collectionId ?? null,
      userId: dto.userId,
      contextId: dto.contextId,
      content: {
        front: dto.content.front,
        back: dto.content.back,
        article: dto.content.article ?? null,
        gender: (dto.content.gender ?? null) as import('@lingua-card/shared/domain').GenderType,
        examples: (dto.content.examples ?? []).map(e => ({ id: randomUUID(), ...e })),
        notes: dto.content.notes ?? '',
        audioAssetId: dto.content.audioAssetId ?? null,
        imageUrl: dto.content.imageUrl ?? null,
        phonetic: dto.content.phonetic ?? null,
      },
      categoryIds: dto.categoryIds ?? [],
      tags: dto.tags ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.cards.push(card);
    return card;
  }

  update(id: string, dto: UpdateCardDto): Card {
    const index = this.cards.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Card ${id} not found`);
    this.cards[index] = {
      ...this.cards[index],
      ...dto,
      content: dto.content
        ? { ...this.cards[index].content, ...dto.content } as import('@lingua-card/shared/domain').CardContent
        : this.cards[index].content,
      updatedAt: new Date().toISOString(),
    };
    return this.cards[index];
  }

  remove(id: string): void {
    const index = this.cards.findIndex(c => c.id === id);
    if (index === -1) throw new NotFoundException(`Card ${id} not found`);
    this.cards.splice(index, 1);
  }
}
