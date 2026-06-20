import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformCollectionEntity } from '../../admin/platform-collection.entity';
import { AdminService } from '../../admin/admin.service';
import { STARTER_COLLECTIONS } from './starter-collections';

@Injectable()
export class StarterCollectionsSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StarterCollectionsSeedService.name);

  constructor(
    @InjectRepository(PlatformCollectionEntity)
    private readonly platformCollections: Repository<PlatformCollectionEntity>,
    private readonly adminService: AdminService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedStarterCollections();
  }

  private async seedStarterCollections(): Promise<void> {
    for (const collection of STARTER_COLLECTIONS) {
      const existing = await this.platformCollections.findOneBy({ title: collection.title });
      if (existing) continue;

      try {
        const result = await this.adminService.importCollectionJson(collection);
        await this.platformCollections.update(result.collectionId, { isPublished: true });
        this.logger.log(`Seeded starter collection "${collection.title}" (${collection.level}): ${result.inserted} words`);
      } catch (err) {
        this.logger.warn(`Failed to seed "${collection.title}": ${(err as Error).message}`);
      }
    }
  }
}
