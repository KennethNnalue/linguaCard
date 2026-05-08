import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MOCK_CARDS,
  MOCK_COLLECTIONS,
  MOCK_CATEGORIES,
} from '@lingua-card/shared/testing';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(CardEntity)
    private readonly cards: Repository<CardEntity>,
    @InjectRepository(CollectionEntity)
    private readonly collections: Repository<CollectionEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedCategories();
    await this.seedCollections();
    await this.seedCards();
  }

  private async seedCategories(): Promise<void> {
    const count = await this.categories.count();
    if (count > 0) return;
    const entities = MOCK_CATEGORIES.map(c =>
      this.categories.create({
        id: c.id,
        userId: c.userId,
        name: c.name,
        colour: c.colour,
        cardCount: c.cardCount,
      }),
    );
    await this.categories.save(entities);
    this.logger.log(`Seeded ${entities.length} categories`);
  }

  private async seedCollections(): Promise<void> {
    const count = await this.collections.count();
    if (count > 0) return;
    const entities = MOCK_COLLECTIONS.map(c =>
      this.collections.create({
        id: c.id,
        userId: c.userId,
        name: c.name,
        description: c.description,
        emoji: c.emoji,
        colour: c.colour,
        contextId: c.contextId,
        cardCount: c.cardCount,
        masteredCount: c.masteredCount,
        dueCount: c.dueCount,
        isDefault: c.isDefault,
      }),
    );
    await this.collections.save(entities);
    this.logger.log(`Seeded ${entities.length} collections`);
  }

  private async seedCards(): Promise<void> {
    const count = await this.cards.count();
    if (count > 0) return;
    const entities = MOCK_CARDS.map(c =>
      this.cards.create({
        id: c.id,
        deckId: c.deckId,
        collectionId: c.collectionId,
        userId: c.userId,
        contextId: c.contextId,
        content: c.content,
        categoryIds: c.categoryIds,
        tags: c.tags,
        version: c.version,
        srsState: c.srsState ?? null,
      }),
    );
    await this.cards.save(entities);
    this.logger.log(`Seeded ${entities.length} cards`);
  }
}
