import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { DiscountCodeEntity } from './discount-code.entity';
import { DiscountRedemptionEntity } from './discount-redemption.entity';
import { SubscriptionService } from '../subscriptions/subscription.service';
import type {
  AdminDiscountCodeListItem,
  AdminGenerateDiscountCodeDto,
  RedeemDiscountResult,
} from '@lingua-card/shared/domain';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const GENERATED_CODE_LENGTH = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class DiscountCodesService {
  constructor(
    @InjectRepository(DiscountCodeEntity)
    private readonly codeRepo: Repository<DiscountCodeEntity>,
    @InjectRepository(DiscountRedemptionEntity)
    private readonly redemptionRepo: Repository<DiscountRedemptionEntity>,
    private readonly subscriptions: SubscriptionService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────

  async generate(dto: AdminGenerateDiscountCodeDto): Promise<AdminDiscountCodeListItem> {
    if (dto.percentOff < 1 || dto.percentOff > 100) {
      throw new BadRequestException('percentOff must be between 1 and 100');
    }

    let code: string;
    if (dto.code && dto.code.trim()) {
      code = this.normalize(dto.code);
      if (!/^[A-Z0-9]{3,50}$/.test(code)) {
        throw new BadRequestException('Custom code must be 3–50 letters/digits');
      }
      const existing = await this.codeRepo.findOneBy({ code });
      if (existing) throw new ConflictException('Code already exists');
    } else {
      code = await this.generateUniqueCode();
    }

    const entity = this.codeRepo.create({
      code,
      percentOff:     dto.percentOff,
      durationDays:   dto.durationDays,
      maxRedemptions: dto.maxRedemptions,
      expiresAt:      dto.expiresAt ? new Date(dto.expiresAt) : null,
      label:          dto.label?.trim() || null,
      isActive:       true,
      redeemedCount:  0,
    });
    const saved = await this.codeRepo.save(entity);
    return this.toListItem(saved);
  }

  async list(): Promise<AdminDiscountCodeListItem[]> {
    const codes = await this.codeRepo.find({ order: { createdAt: 'DESC' } });
    return codes.map((c) => this.toListItem(c));
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.codeRepo.update({ id }, { isActive });
  }

  // ── User redemption ──────────────────────────────────────────────────────

  async redeem(userId: string, rawCode: string): Promise<RedeemDiscountResult> {
    const code = this.normalize(rawCode ?? '');
    if (!code) return { status: 'invalid', message: 'Enter a code' };

    const entity = await this.codeRepo.findOneBy({ code });
    if (!entity || !entity.isActive) {
      return { status: 'invalid', message: 'Invalid code' };
    }
    if (entity.expiresAt && entity.expiresAt.getTime() < Date.now()) {
      return { status: 'invalid', message: 'This code has expired' };
    }
    if (entity.maxRedemptions !== null && entity.redeemedCount >= entity.maxRedemptions) {
      return { status: 'invalid', message: 'This code has reached its redemption limit' };
    }
    const already = await this.redemptionRepo.findOneBy({ codeId: entity.id, userId });
    if (already) {
      return { status: 'invalid', message: 'You have already used this code' };
    }

    // Partial discounts have no in-app checkout to apply to yet → route to manual upgrade.
    if (entity.percentOff < 100) {
      return { status: 'partial', percentOff: entity.percentOff };
    }

    // 100% → self-activate Pro atomically: record redemption + bump count + grant Pro
    // all in one transaction so a failure can't half-consume the code.
    const expiresAt = entity.durationDays !== null
      ? new Date(Date.now() + entity.durationDays * DAY_MS)
      : null;

    try {
      await this.dataSource.transaction(async (manager) => {
        // Atomic guard against concurrent over-redemption. Parentheses are required so the
        // OR does not bind looser than the id predicate (SQL precedence: AND before OR).
        const claim = await manager
          .createQueryBuilder()
          .update(DiscountCodeEntity)
          .set({ redeemedCount: () => 'redeemed_count + 1' })
          .where('id = :id', { id: entity.id })
          .andWhere('(max_redemptions IS NULL OR redeemed_count < max_redemptions)')
          .execute();
        if (!claim.affected) {
          throw new ConflictException('This code has reached its redemption limit');
        }
        // Unique (code_id, user_id) index makes this the atomic one-per-user guard.
        await manager.insert(DiscountRedemptionEntity, { codeId: entity.id, userId });
        await this.subscriptions.activatePro(userId, {
          expiresAt,
          notes: `Discount code ${entity.code} (100% off)`,
          manager,
        });
      });
    } catch (err) {
      // Concurrent redemption by the same user trips the unique index → treat as already used.
      if (this.isUniqueViolation(err)) {
        return { status: 'invalid', message: 'You have already used this code' };
      }
      if (err instanceof ConflictException) {
        return { status: 'invalid', message: 'This code has reached its redemption limit' };
      }
      throw err;
    }

    const subscription = await this.subscriptions.getStatusForUser(userId);
    return { status: 'activated', percentOff: 100, subscription };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private normalize(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, '');
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Array.from(
        { length: GENERATED_CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join('');
      const exists = await this.codeRepo.findOneBy({ code: candidate });
      if (!exists) return candidate;
    }
    throw new ConflictException('Could not generate a unique code, try again');
  }

  /** True when an error is a Postgres unique-constraint violation. */
  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
    );
  }

  private toListItem(c: DiscountCodeEntity): AdminDiscountCodeListItem {
    return {
      id:             c.id,
      code:           c.code,
      percentOff:     c.percentOff,
      durationDays:   c.durationDays,
      maxRedemptions: c.maxRedemptions,
      redeemedCount:  c.redeemedCount,
      expiresAt:      c.expiresAt?.toISOString() ?? null,
      isActive:       c.isActive,
      label:          c.label,
      createdAt:      c.createdAt.toISOString(),
    };
  }
}
