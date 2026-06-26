import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type {
  ShareRecord, CreateShareDto, ShareNotificationList,
  ShareNotification,
} from '@lingua-card/shared/domain';
import { ShareEntity } from './share.entity';
import { UserEntity } from '../auth/user.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CardEntity } from '../cards/card.entity';
import { StoryEntity } from '../stories/story.entity';
import { PushService } from '../push/push.service';
import { ShareSyncService } from './share-sync.service';
import { UserSettingsEntity } from '../settings/user-settings.entity';

const SHARE_PUSH_TITLES: Record<string, string> = {
  en: 'New share received',
  es: 'Nuevo contenido compartido',
  tr: 'Yeni paylaşım alındı',
  uk: 'Нове поділення отримано',
  ru: 'Получено новое поділення',
  ar: 'تم استلام مشاركة جديدة',
};

const SHARE_PUSH_BODY: Record<string, string> = {
  en: '{{name}} shared a {{type}} "{{resource}}" with you',
  es: '{{name}} compartió una {{type}} "{{resource}}" contigo',
  tr: '{{name}} sizinle bir {{type}} "{{resource}}" paylaştı',
  uk: '{{name}} поділився з вами {{type}} "{{resource}}"',
  ru: '{{name}} поделился с вами {{type}} "{{resource}}"',
  ar: '{{name}} شارك معك {{type}} "{{resource}}"',
};

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    @InjectRepository(ShareEntity)
    private readonly shareRepo: Repository<ShareEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepo: Repository<CollectionEntity>,
    @InjectRepository(CardEntity)
    private readonly cardRepo: Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,
    private readonly pushService: PushService,
    private readonly syncService: ShareSyncService,
  ) {}

  async create(senderId: string, dto: CreateShareDto): Promise<ShareRecord> {
    const sender = await this.userRepo.findOneBy({ id: senderId });
    if (!sender) throw new NotFoundException('Sender not found');

    if (sender.email.toLowerCase() === dto.recipientEmail.toLowerCase()) {
      throw new BadRequestException('Cannot share with yourself');
    }

    const recipient = await this.userRepo.findOneBy({
      email: dto.recipientEmail.toLowerCase(),
    });
    if (!recipient) throw new NotFoundException('No user found with that email');

    let resourceName = '';
    let resourceEmoji: string | null = null;

    if (dto.resourceType === 'collection') {
      const col = await this.collectionRepo.findOneBy({ id: dto.resourceId, userId: senderId });
      if (!col) throw new ForbiddenException('Collection not found or not owned by you');
      resourceName = col.name;
      resourceEmoji = col.emoji;
    } else {
      const story = await this.storyRepo.findOneBy({ id: dto.resourceId, userId: senderId });
      if (!story) throw new ForbiddenException('Story not found or not owned by you');
      resourceName = story.title;
    }

    const entity = this.shareRepo.create({
      id: randomUUID(),
      senderUserId: senderId,
      senderName: sender.name,
      senderEmail: sender.email,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      resourceName,
      resourceEmoji,
      syncMode: dto.syncMode,
      status: 'pending',
      clonedResourceId: null,
      respondedAt: null,
    });

    const saved = await this.shareRepo.save(entity);

    const settings = await this.settingsRepo.findOneBy({ userId: recipient.id });
    const lang = settings?.uiLanguage ?? 'en';
    const title = SHARE_PUSH_TITLES[lang] ?? SHARE_PUSH_TITLES['en'];
    const bodyTpl = SHARE_PUSH_BODY[lang] ?? SHARE_PUSH_BODY['en'];
    const body = bodyTpl
      .replace('{{name}}', sender.name)
      .replace('{{type}}', dto.resourceType)
      .replace('{{resource}}', resourceName);

    await this.pushService.sendToUser(recipient.id, { title, body, url: '/notifications' });

    return this.toRecord(saved);
  }

  async findPending(userId: string): Promise<ShareNotificationList> {
    const shares = await this.shareRepo.find({
      where: { recipientUserId: userId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    return {
      pending: shares.map(s => this.toNotification(s)),
      total: shares.length,
    };
  }

  async pendingCount(userId: string): Promise<number> {
    return this.shareRepo.count({
      where: { recipientUserId: userId, status: 'pending' },
    });
  }

  async respond(userId: string, shareId: string, accept: boolean): Promise<ShareRecord> {
    const share = await this.shareRepo.findOneBy({ id: shareId, recipientUserId: userId });
    if (!share) throw new NotFoundException('Share not found');

    if (share.status !== 'pending') {
      return this.toRecord(share);
    }

    if (!accept) {
      share.status = 'rejected';
      share.respondedAt = new Date();
      return this.toRecord(await this.shareRepo.save(share));
    }

    let clonedId: string;
    if (share.resourceType === 'collection') {
      clonedId = await this.cloneCollection(share.senderUserId, share.resourceId, userId);
    } else {
      clonedId = await this.cloneStory(share.resourceId, userId);
    }

    share.status = 'accepted';
    share.clonedResourceId = clonedId;
    share.respondedAt = new Date();
    const saved = await this.shareRepo.save(share);

    if (share.syncMode === 'sync') {
      await this.syncService.createLink(
        share.id, share.resourceId, clonedId, share.resourceType,
      );
    }

    return this.toRecord(saved);
  }

  async findSent(userId: string): Promise<ShareRecord[]> {
    const shares = await this.shareRepo.find({
      where: { senderUserId: userId },
      order: { createdAt: 'DESC' },
    });
    return shares.map(s => this.toRecord(s));
  }

  async cancel(userId: string, shareId: string): Promise<void> {
    const share = await this.shareRepo.findOneBy({ id: shareId, senderUserId: userId });
    if (!share) throw new NotFoundException('Share not found');
    if (share.status !== 'pending') {
      throw new BadRequestException('Can only cancel pending shares');
    }
    await this.shareRepo.remove(share);
  }

  private async cloneCollection(senderUserId: string, collectionId: string, recipientUserId: string): Promise<string> {
    const source = await this.collectionRepo.findOneBy({ id: collectionId });
    if (!source) throw new NotFoundException('Source collection no longer exists');

    const sourceCards = await this.cardRepo.find({ where: { collectionId, userId: senderUserId } });

    const newColId = randomUUID();
    return this.collectionRepo.manager.transaction(async manager => {
      const col = manager.create(CollectionEntity, {
        id: newColId,
        userId: recipientUserId,
        name: source.name,
        description: source.description,
        emoji: source.emoji,
        colour: source.colour,
        contextId: source.contextId,
        cardCount: 0,
        masteredCount: 0,
        dueCount: 0,
        isDefault: false,
        importStatus: 'complete',
        pendingWords: [],
        sourcePlatformCollectionId: source.sourcePlatformCollectionId,
        level: source.level,
        topic: source.topic,
      });
      await manager.save(col);

      const newCards = sourceCards.map(c =>
        manager.create(CardEntity, {
          id: randomUUID(),
          userId: recipientUserId,
          collectionId: newColId,
          deckId: c.deckId,
          contextId: c.contextId,
          dictionaryWordId: c.dictionaryWordId,
          content: { ...c.content },
          categoryIds: [...c.categoryIds],
          tags: [...c.tags],
          version: 1,
          srsState: null,
        }),
      );

      if (newCards.length) {
        await manager.save(newCards);
        col.cardCount = newCards.length;
        await manager.save(col);
      }

      return newColId;
    });
  }

  private async cloneStory(storyId: string, recipientUserId: string): Promise<string> {
    const source = await this.storyRepo.findOneBy({ id: storyId });
    if (!source) throw new NotFoundException('Source story no longer exists');

    const newId = randomUUID();
    const entity = this.storyRepo.create({
      id: newId,
      userId: recipientUserId,
      title: source.title,
      titleTranslation: source.titleTranslation,
      bodyDe: source.bodyDe,
      bodyNative: source.bodyNative,
      nativeLang: source.nativeLang,
      sentences: source.sentences,
      wordTimestamps: source.wordTimestamps,
      vocabWords: [],
      audioUrl: source.audioUrl,
      audioDurationMs: source.audioDurationMs,
      sourceCollectionIds: [],
      difficultyLevel: source.difficultyLevel,
      lengthType: source.lengthType,
      listenCount: 0,
      lastListenedAt: null,
      coverImageUrl: source.coverImageUrl,
      quizQuestions: source.quizQuestions,
      grammarNotes: source.grammarNotes,
      keywords: source.keywords,
      isLearned: false,
      modelUsed: null,
      generationStatus: 'complete',
      sourcePlatformStoryId: source.sourcePlatformStoryId,
    });

    await this.storyRepo.save(entity);
    return newId;
  }

  private toRecord(e: ShareEntity): ShareRecord {
    return {
      id: e.id,
      senderUserId: e.senderUserId,
      senderName: e.senderName,
      senderEmail: e.senderEmail,
      recipientUserId: e.recipientUserId ?? '',
      recipientEmail: e.recipientEmail,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      resourceName: e.resourceName,
      resourceEmoji: e.resourceEmoji,
      syncMode: e.syncMode,
      status: e.status,
      clonedResourceId: e.clonedResourceId,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      respondedAt: e.respondedAt ? (e.respondedAt instanceof Date ? e.respondedAt.toISOString() : String(e.respondedAt)) : null,
    };
  }

  private toNotification(e: ShareEntity): ShareNotification {
    return {
      id: e.id,
      senderName: e.senderName,
      resourceType: e.resourceType,
      resourceName: e.resourceName,
      resourceEmoji: e.resourceEmoji,
      syncMode: e.syncMode,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    };
  }
}
