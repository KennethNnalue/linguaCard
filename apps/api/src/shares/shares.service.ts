import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
  ConflictException, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { createNewReviewScheduling } from '../review/review-scheduling.entity';
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

// Pending shares older than this are swept to 'expired' by the daily cron.
const SHARE_TTL_DAYS = 30;
// Lightweight per-user create throttle (single-instance, in-memory). Backstop
// against accidental loops / abuse; the duplicate guard handles the common case.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);
  private readonly createTimestamps = new Map<string, number[]>();

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
    this.enforceRateLimit(senderId);

    const recipientEmail = dto.recipientEmail.trim().toLowerCase();

    const sender = await this.userRepo.findOneBy({ id: senderId });
    if (!sender) throw new NotFoundException('Sender not found');

    if (sender.email.toLowerCase() === recipientEmail) {
      throw new BadRequestException('Cannot share with yourself');
    }

    const recipient = await this.findUserByEmail(recipientEmail);
    if (!recipient) throw new NotFoundException('No user found with that email');

    // Prevent flooding the recipient with duplicate pending notifications for
    // the same resource. An already-pending share blocks re-sharing until it is
    // accepted/rejected.
    const duplicate = await this.shareRepo.findOneBy({
      senderUserId: senderId,
      recipientUserId: recipient.id,
      resourceId: dto.resourceId,
      status: 'pending',
    });
    if (duplicate) {
      throw new ConflictException('You already have a pending share for this with that person');
    }

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

    // Push is best-effort — a notification failure must never fail the share
    // that was already persisted above.
    try {
      const settings = await this.settingsRepo.findOneBy({ userId: recipient.id });
      const lang = settings?.uiLanguage ?? 'en';
      const title = SHARE_PUSH_TITLES[lang] ?? SHARE_PUSH_TITLES['en'];
      const bodyTpl = SHARE_PUSH_BODY[lang] ?? SHARE_PUSH_BODY['en'];
      const body = bodyTpl
        .replace('{{name}}', sender.name)
        .replace('{{type}}', dto.resourceType)
        .replace('{{resource}}', resourceName);

      await this.pushService.sendToUser(recipient.id, { title, body, url: '/notifications' });
    } catch (err) {
      this.logger.warn(`Share push notification failed: ${(err as Error).message}`);
    }

    return this.toRecord(saved);
  }

  // ── Rate limiting ──────────────────────────────────────────────────────

  private enforceRateLimit(userId: string): void {
    const now = Date.now();
    const recent = (this.createTimestamps.get(userId) ?? [])
      .filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpException(
        'Too many shares in a short time — please slow down',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.createTimestamps.set(userId, recent);
  }

  private findUserByEmail(email: string) {
    return this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
  }

  // ── Expiry sweep ───────────────────────────────────────────────────────

  /** Marks pending shares older than SHARE_TTL_DAYS as expired (runs daily). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireStaleShares(): Promise<void> {
    const cutoff = new Date(Date.now() - SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.shareRepo.update(
      { status: 'pending', createdAt: LessThan(cutoff) },
      { status: 'expired' },
    );
    if (result.affected) {
      this.logger.log(`Expired ${result.affected} stale pending share(s)`);
    }
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

    // Accept: clone the resource, flip the share to accepted, and (for sync
    // mode) create the link — all atomically so we never end up with a clone
    // and no sync link, or an accepted share with no clone.
    const saved = await this.shareRepo.manager.transaction(async (manager) => {
      const clonedId = share.resourceType === 'collection'
        ? await this.cloneCollection(manager, share.senderUserId, share.resourceId, userId)
        : await this.cloneStory(manager, share.resourceId, userId);

      share.status = 'accepted';
      share.clonedResourceId = clonedId;
      share.respondedAt = new Date();
      const persisted = await manager.save(share);

      if (share.syncMode === 'sync') {
        await this.syncService.createLink(
          share.id, share.resourceId, clonedId, share.resourceType, manager,
        );
      }

      return persisted;
    });

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

  private async cloneCollection(manager: EntityManager, senderUserId: string, collectionId: string, recipientUserId: string): Promise<string> {
    const collectionRepo = manager.getRepository(CollectionEntity);
    const cardRepo = manager.getRepository(CardEntity);

    const source = await collectionRepo.findOneBy({ id: collectionId });
    if (!source) throw new NotFoundException('Source collection no longer exists');

    const sourceCards = await cardRepo.find({ where: { collectionId, userId: senderUserId } });

    const newColId = randomUUID();
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

    const newCards = sourceCards.map(c => {
      const cardId = randomUUID();
      return manager.create(CardEntity, {
        id: cardId,
        userId: recipientUserId,
        collectionId: newColId,
        deckId: c.deckId,
        contextId: c.contextId,
        dictionaryWordId: c.dictionaryWordId,
        content: { ...c.content },
        categoryIds: [...c.categoryIds],
        tags: [...c.tags],
        version: 1,
        scheduling: createNewReviewScheduling(cardId),
      });
    });

    if (newCards.length) {
      await manager.save(newCards);
      col.cardCount = newCards.length;
      await manager.save(col);
    }

    return newColId;
  }

  private async cloneStory(manager: EntityManager, storyId: string, recipientUserId: string): Promise<string> {
    const source = await manager.getRepository(StoryEntity).findOneBy({ id: storyId });
    if (!source) throw new NotFoundException('Source story no longer exists');

    const newId = randomUUID();
    const entity = manager.create(StoryEntity, {
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

    await manager.save(entity);
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
