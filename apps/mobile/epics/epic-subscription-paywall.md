# Epic: Subscription, Paywall & Tiered AI Routing
## Free vs Pro · Manual Subscription Management · Tier-Aware Story Generation

> **Epic Number:** LC-103 (continuing from LC-102 OpenRouter deploy)
> **Feature Areas:**
> - `libs/shared/domain/src/index.ts` — new subscription types
> - `apps/api/src/subscriptions/` — new NestJS module
> - `apps/api/src/auth/user.entity.ts` — subscription relation
> - `apps/api/src/stories/story-generation.service.ts` — tier-aware provider routing
> - `apps/mobile/src/app/features/subscription/` — new Angular feature
> - `apps/mobile/src/app/features/stories/` — paywall guard + generate sheet changes
> **Ticket numbers:** LC-103 through LC-118
> **Contact email for upgrade requests:** kennethnnalue.dev@gmail.com

---

## Context & Background

LinguaCard currently generates all stories with Claude Sonnet 4.6 regardless of who the user is.
This epic introduces:

1. **A `subscriptions` table** managed manually in the database — no payment processor yet.
   Kenneth edits one row to flip a user from `free` to `pro`.
2. **Tier-aware story generation** — `pro` users get Claude Sonnet 4.6 (best quality);
   `free` users get Gemini 2.5 Flash (good quality, ~6× cheaper).
3. **A paywall** on the "Generate Story" button — free users see a modal explaining the Pro
   upgrade and a contact form that emails `kennethnnalue.dev@gmail.com` so Kenneth can
   manually activate the subscription.
4. **Free tier story limit** — free users can generate up to **3 stories total** before hitting
   the paywall. Pro users have unlimited generation.

### Why manual subscription management?

No payment processor is integrated yet. The contact-form approach lets real users express
interest and lets Kenneth activate Pro manually, giving time to validate demand before
building a full billing integration.

---

## Architecture

```
USER TAPS "Generate Story"
  ↓
SubscriptionGuard (Angular)
  ↓ checks UserStore.subscription()
  ├─ FREE + storiesGenerated < 3 → allow, route to Gemini Flash
  ├─ FREE + storiesGenerated >= 3 → open PaywallModalComponent
  │     └─ modal has "Upgrade to Pro" → opens UpgradeContactSheetComponent
  │           └─ user fills form → POST /api/v1/contact/upgrade
  │                 └─ NestJS sends email to kennethnnalue.dev@gmail.com
  └─ PRO → allow, route to Claude Sonnet 4.6

STORY GENERATION (NestJS)
  ↓ POST /stories/generate
  SubscriptionService.getForUser(userId)
  ↓
  StoryGenerationService.generateAndSave(userId, dto, tier)
  ├─ tier === 'pro'  → textProvider = AnthropicAdapter (Claude Sonnet 4.6)
  └─ tier === 'free' → textProvider = GeminiAdapter   (Gemini 2.5 Flash)
```

### Database schema

```sql
-- subscriptions table (managed manually)
CREATE TABLE subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tier         VARCHAR(20) NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
  activated_at TIMESTAMPTZ,                           -- NULL until manually activated
  expires_at   TIMESTAMPTZ,                           -- NULL = never expires
  notes        TEXT,                                  -- Kenneth's internal notes
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-user lookup (used on every story generation)
CREATE UNIQUE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
```

**Manual activation workflow (Kenneth's side):**
```sql
-- Activate Pro for a user
UPDATE subscriptions SET tier = 'pro', activated_at = NOW(), notes = 'Activated 2026-06-02'
WHERE user_id = '<user-id>';

-- Revert to free
UPDATE subscriptions SET tier = 'free', expires_at = NOW()
WHERE user_id = '<user-id>';
```

---

## Story Map

| Phase | Ticket  | Title                                                        | Points |
|-------|---------|--------------------------------------------------------------|--------|
| 0 — Types  | LC-103 | Shared domain types for subscriptions                   | 1      |
| 1 — Backend | LC-104 | `SubscriptionEntity` + TypeORM migration                | 2      |
| 1 — Backend | LC-105 | `SubscriptionService` — CRUD + auto-create on register  | 3      |
| 1 — Backend | LC-106 | `SubscriptionController` — `GET /subscriptions/me`      | 2      |
| 1 — Backend | LC-107 | Tier-aware `textProvider` in `StoryGenerationService`   | 3      |
| 1 — Backend | LC-108 | `ContactController` — upgrade email endpoint            | 3      |
| 2 — Angular | LC-109 | `SubscriptionStore` (Angular signal store)              | 3      |
| 2 — Angular | LC-110 | `SubscriptionApiService`                                | 1      |
| 2 — Angular | LC-111 | `PaywallModalComponent`                                 | 3      |
| 2 — Angular | LC-112 | `UpgradeContactSheetComponent`                          | 3      |
| 2 — Angular | LC-113 | Paywall guard on `GenerateStorySheetComponent`          | 2      |
| 2 — Angular | LC-114 | Show tier badge in `UserMenuComponent`                  | 1      |
| 3 — Auth    | LC-115 | Auto-create `free` subscription on user registration    | 2      |
| 4 — Polish  | LC-116 | Story count display on generate sheet (free users)      | 1      |
| 4 — Polish  | LC-117 | `env.example` + Render env for email config             | 1      |
| 5 — Tests   | LC-118 | Unit tests for tier routing + subscription service      | 2      |

**Total: 33 points**

---

---

## LC-103 · Shared domain types for subscriptions

**Epic:** Subscription & Paywall
**Phase:** 0 — Do this first (unblocks all other tickets)
**Points:** 1
**Depends on:** nothing

### User story

As a developer, I want shared TypeScript types for subscriptions so that the Angular app and NestJS backend share a single contract from day one and TypeScript catches any mismatch at compile time.

### Files to modify

| File | Change |
|------|--------|
| `libs/shared/domain/src/index.ts` | Add subscription types below |

### Types to add

```typescript
// libs/shared/domain/src/index.ts

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro';

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  activatedAt: string | null;   // ISO datetime string
  expiresAt:   string | null;   // ISO datetime string — null means never expires
  createdAt:   string;
}

export interface SubscriptionStatus {
  tier:              SubscriptionTier;
  isActive:          boolean;           // true if tier === 'pro' and not expired
  storiesGenerated:  number;            // total stories this user has ever generated
  storiesRemaining:  number | null;     // null = unlimited (pro); number for free tier
  freeStoryLimit:    number;            // always 3 for now
}

// ─── CONTACT / UPGRADE ───────────────────────────────────────────────────────

export interface UpgradeRequestDto {
  name:    string;
  email:   string;
  message: string;   // optional note from the user
}
```

### Acceptance criteria

- [ ] `SubscriptionTier`, `Subscription`, `SubscriptionStatus`, `UpgradeRequestDto` exported from `@lingua-card/shared/domain`
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`
- [ ] No existing types broken

---

---

## LC-104 · `SubscriptionEntity` + TypeORM migration

**Epic:** Subscription & Paywall
**Phase:** 1 — Backend
**Points:** 2
**Depends on:** LC-103

### User story

As a developer, I want a `subscriptions` table in PostgreSQL with a TypeORM entity, so that subscription records can be read and written by the API.

### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/subscriptions/subscription.entity.ts` | TypeORM entity |
| `apps/api/src/subscriptions/subscriptions.module.ts` | NestJS module |

### Implementation

```typescript
// apps/api/src/subscriptions/subscription.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { UserEntity } from '../auth/user.entity';
import type { SubscriptionTier } from '@lingua-card/shared/domain';

@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  tier!: SubscriptionTier;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true, default: null })
  activatedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true, default: null })
  expiresAt!: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

```typescript
// apps/api/src/subscriptions/subscriptions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEntity } from './subscription.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity])],
  providers: [SubscriptionService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
```

Register `SubscriptionsModule` in `AppModule`:
```typescript
// apps/api/src/app.module.ts
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
// add SubscriptionsModule to imports array
```

### TypeORM migration note

Since the project uses `synchronize: true` in development (or manual migrations), the table
is created automatically. For production, run `typeorm migration:generate` after adding the entity.

### Acceptance criteria

- [ ] `SubscriptionEntity` has all columns: `id`, `userId`, `tier`, `activatedAt`, `expiresAt`, `notes`, `createdAt`, `updatedAt`
- [ ] `tier` column defaults to `'free'`
- [ ] `userId` has a unique index
- [ ] Foreign key to `users(id)` with `ON DELETE CASCADE`
- [ ] `SubscriptionsModule` exports `SubscriptionService`
- [ ] `AppModule` imports `SubscriptionsModule`
- [ ] `tsc --noEmit` passes in `apps/api/`
- [ ] `npm run dev:api` starts without error; `subscriptions` table exists in DB

---

---

## LC-105 · `SubscriptionService` — CRUD + helpers

**Epic:** Subscription & Paywall
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-104

### User story

As a developer, I want a `SubscriptionService` with methods for getting a user's subscription, creating a free subscription on registration, and computing the subscription status (tier + stories remaining), so that the rest of the app can consume subscription state without knowing the DB schema.

### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/subscriptions/subscription.service.ts` | Business logic |

### Implementation

```typescript
// apps/api/src/subscriptions/subscription.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity } from './subscription.entity';
import { StoryEntity } from '../stories/story.entity';
import type { Subscription, SubscriptionStatus, SubscriptionTier } from '@lingua-card/shared/domain';

const FREE_STORY_LIMIT = 3;

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subRepo: Repository<SubscriptionEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo: Repository<StoryEntity>,
  ) {}

  // Called during user registration — always creates a 'free' row
  async createFree(userId: string): Promise<SubscriptionEntity> {
    const entity = this.subRepo.create({ userId, tier: 'free' });
    return this.subRepo.save(entity);
  }

  // Returns the subscription row, creating a free one if it doesn't exist yet
  async getOrCreateForUser(userId: string): Promise<SubscriptionEntity> {
    let sub = await this.subRepo.findOneBy({ userId });
    if (!sub) sub = await this.createFree(userId);
    return sub;
  }

  // Full status including stories-remaining count — used by Angular and story generation
  async getStatusForUser(userId: string): Promise<SubscriptionStatus> {
    const sub = await this.getOrCreateForUser(userId);
    const storiesGenerated = await this.storyRepo.countBy({ userId });

    const isActive =
      sub.tier === 'pro' &&
      (sub.expiresAt === null || sub.expiresAt > new Date());

    const storiesRemaining =
      isActive ? null : Math.max(0, FREE_STORY_LIMIT - storiesGenerated);

    return {
      tier:             sub.tier,
      isActive,
      storiesGenerated,
      storiesRemaining,
      freeStoryLimit:   FREE_STORY_LIMIT,
    };
  }

  // Resolves the effective AI tier for story generation — 'pro' or 'free'
  async getEffectiveTier(userId: string): Promise<SubscriptionTier> {
    const status = await this.getStatusForUser(userId);
    return status.isActive ? 'pro' : 'free';
  }

  toModel(entity: SubscriptionEntity): Subscription {
    return {
      id:          entity.id,
      userId:      entity.userId,
      tier:        entity.tier,
      activatedAt: entity.activatedAt?.toISOString() ?? null,
      expiresAt:   entity.expiresAt?.toISOString()   ?? null,
      createdAt:   entity.createdAt.toISOString(),
    };
  }
}
```

### Module update — inject `StoryEntity`

```typescript
// apps/api/src/subscriptions/subscriptions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEntity } from './subscription.entity';
import { StoryEntity } from '../stories/story.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity, StoryEntity])],
  providers: [SubscriptionService],
  controllers: [SubscriptionController],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
```

### Acceptance criteria

- [ ] `createFree(userId)` creates a row with `tier = 'free'`, `activatedAt = null`, `expiresAt = null`
- [ ] `getOrCreateForUser(userId)` returns existing row or creates a fresh free one — never throws
- [ ] `getStatusForUser(userId)`:
  - returns `isActive = true` only when `tier === 'pro'` AND (`expiresAt` is null OR in the future)
  - returns correct `storiesGenerated` count from the `stories` table
  - returns `storiesRemaining = null` for pro users
  - returns `storiesRemaining = max(0, 3 - storiesGenerated)` for free users
- [ ] `getEffectiveTier(userId)` returns `'pro'` for active pro users, `'free'` otherwise
- [ ] `tsc --noEmit` passes

---

---

## LC-106 · `SubscriptionController` — `GET /subscriptions/me`

**Epic:** Subscription & Paywall
**Phase:** 1 — Backend
**Points:** 2
**Depends on:** LC-105

### User story

As the Angular app, I want to call `GET /api/v1/subscriptions/me` and receive the current user's full subscription status so that the UI can gate story generation without a second round-trip.

### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/subscriptions/subscription.controller.ts` | REST endpoint |

### Implementation

```typescript
// apps/api/src/subscriptions/subscription.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  getMySubscription(@CurrentUser() user: RequestUser): Promise<SubscriptionStatus> {
    return this.subscriptionService.getStatusForUser(user.userId);
  }
}
```

### Acceptance criteria

- [ ] `GET /api/v1/subscriptions/me` returns `SubscriptionStatus` JSON for the authenticated user
- [ ] Returns 401 if no JWT token provided (handled by global `JwtAuthGuard`)
- [ ] For a brand-new user with no stories, returns `{ tier: 'free', isActive: false, storiesGenerated: 0, storiesRemaining: 3, freeStoryLimit: 3 }`
- [ ] For a pro user, returns `{ tier: 'pro', isActive: true, storiesRemaining: null }`
- [ ] Manual test with Postman/curl confirms correct response shape

---

---

## LC-107 · Tier-aware `textProvider` in `StoryGenerationService`

**Epic:** Subscription & Paywall
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-105, LC-099 (openrouter textProvider already wired)

### User story

As a product owner, I want story generation to use Claude Sonnet 4.6 for Pro users and Gemini 2.5 Flash for free users automatically, so that I get the best quality where it matters and keep costs low for the free tier.

### Context

`StoryGenerationService.generateAndSave()` currently picks the text provider from `AI_DEFAULT_PROVIDER` env var. This ticket changes that: the provider is now determined per-request by the user's subscription tier, not by a global env var.

The env var `AI_DEFAULT_PROVIDER` still controls the fallback for cases where the subscription cannot be resolved.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/stories/story-generation.service.ts` | Inject `SubscriptionService`; replace `textProvider` getter with `textProviderForUser(userId)` method |
| `apps/api/src/stories/stories.module.ts` | Import `SubscriptionsModule` |

### Implementation

```typescript
// apps/api/src/stories/story-generation.service.ts

// Add to imports
import { SubscriptionService } from '../subscriptions/subscription.service';
import type { SubscriptionTier } from '@lingua-card/shared/domain';

@Injectable()
export class StoryGenerationService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly cardRepo:     Repository<CardEntity>,
    @InjectRepository(StoryEntity)
    private readonly storyRepo:    Repository<StoryEntity>,
    private readonly promptBuilder: StoryPromptBuilder,
    private readonly anthropic:     AnthropicAdapter,
    private readonly gemini:        GeminiAdapter,
    private readonly openRouter:    OpenRouterAdapter,
    private readonly config:        ConfigService,
    private readonly audioService:  StoryAudioService,
    private readonly vocabMapper:   StoryVocabMapper,
    private readonly subscriptions: SubscriptionService,   // ← new injection
  ) {}

  // OLD getter removed. NEW method — resolves per user.
  private async textProviderForTier(tier: SubscriptionTier) {
    switch (tier) {
      case 'pro':
        // Pro users always get Claude Sonnet (highest quality)
        return this.anthropic;
      case 'free':
      default:
        // Free users get Gemini 2.5 Flash (~6x cheaper, good for A1–B1)
        return this.gemini;
    }
  }

  // Keep old getter as a fallback for system-level calls that have no userId
  private get textProvider() {
    const provider = this.config.get<AiConfig>('ai')!.defaultProvider;
    switch (provider) {
      case 'openrouter': return this.openRouter;
      case 'gemini':     return this.gemini;
      default:           return this.anthropic;
    }
  }

  async generateAndSave(userId: string, dto: GenerateStoryDto): Promise<Story> {
    // ── SUBSCRIPTION GATE ──────────────────────────────────────────────────
    const status = await this.subscriptions.getStatusForUser(userId);

    // If free tier and no stories remaining, throw a 403
    if (!status.isActive && status.storiesRemaining !== null && status.storiesRemaining <= 0) {
      throw new ForbiddenException('Story limit reached. Upgrade to Pro for unlimited stories.');
    }

    // ── RESOLVE PROVIDER ───────────────────────────────────────────────────
    const tier     = status.isActive ? 'pro' : 'free';
    const provider = await this.textProviderForTier(tier);

    const cards = await this.cardRepo.find({
      where: { userId, collectionId: In(dto.collectionIds) },
    });
    if (cards.length === 0) {
      throw new BadRequestException('No cards found for the given collections');
    }

    // Pass provider into generateText (replaces the old call to this.textProvider)
    const content = await this.generateTextWithProvider(dto, cards, provider);

    // ... rest of the method unchanged (audio, quiz, grammar, save)
  }

  // Renamed from generateText → accepts provider as param
  private async generateTextWithProvider(
    dto: GenerateStoryDto,
    cards: CardEntity[],
    provider: { generateText(r: AITextRequest): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }> },
  ): Promise<GeneratedStoryContent> {
    const prompt = this.promptBuilder.build(dto, cards);
    let rawText: string;
    try {
      const response = await provider.generateText({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 8192,
      });
      rawText = response.text;
      this.logger.log(`Story generated via ${response.model} | tier: ${dto.collectionIds} | tokens: ${response.inputTokens}in/${response.outputTokens}out`);
    } catch (err) {
      this.logger.error('AI text generation error', err);
      throw new InternalServerErrorException('Story generation failed. Please try again.');
    }
    // ... JSON parsing unchanged
  }
}
```

```typescript
// apps/api/src/stories/stories.module.ts
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoryEntity, CardEntity]),
    AiModule,
    SubscriptionsModule,   // ← add
  ],
  // ...
})
export class StoriesModule {}
```

### Acceptance criteria

- [ ] A pro user generates a story → API log shows `claude-sonnet-4-6` (or Anthropic model name)
- [ ] A free user generates a story → API log shows `gemini-2.5-flash` (or Gemini model name)
- [ ] A free user who has already generated 3 stories gets HTTP 403 with message `'Story limit reached. Upgrade to Pro for unlimited stories.'`
- [ ] A pro user never gets a 403 regardless of story count
- [ ] Old `textProvider` getter is preserved as a non-public fallback — no other code paths break
- [ ] `tsc --noEmit` passes

---

---

## LC-108 · `ContactController` — upgrade email endpoint

**Epic:** Subscription & Paywall
**Phase:** 1 — Backend
**Points:** 3
**Depends on:** LC-103

### User story

As a free-tier user, when I submit the upgrade contact form, I want an email sent to Kenneth so that he knows I want to upgrade and can manually activate my Pro subscription.

### Context

No payment processor. The form collects name, email, and an optional message. The backend
sends a plain-text email to `kennethnnalue.dev@gmail.com` using Nodemailer with a
transactional email provider (we use SMTP/Gmail app password — the simplest option that
requires no extra service).

### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/contact/contact.controller.ts` | `POST /contact/upgrade` |
| `apps/api/src/contact/contact.service.ts` | Sends email via Nodemailer |
| `apps/api/src/contact/contact.module.ts` | NestJS module |

### Installation

```bash
cd apps/api && npm install nodemailer
npm install --save-dev @types/nodemailer
```

### Implementation

```typescript
// apps/api/src/contact/contact.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { UpgradeRequestDto } from '@lingua-card/shared/domain';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly toEmail = 'kennethnnalue.dev@gmail.com';

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('SMTP_HOST',     'smtp.gmail.com'),
      port:   this.config.get<number>('SMTP_PORT',     587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
    });
  }

  async sendUpgradeRequest(dto: UpgradeRequestDto, userId?: string): Promise<void> {
    const subject = `LinguaCard Pro Upgrade Request — ${dto.name}`;
    const body = `
New Pro upgrade request from LinguaCard:

Name:    ${dto.name}
Email:   ${dto.email}
User ID: ${userId ?? 'not logged in'}
Message: ${dto.message || '(none)'}

---
To activate Pro, run in your DB:
UPDATE subscriptions SET tier = 'pro', activated_at = NOW(), notes = 'Manual - ${new Date().toISOString().slice(0, 10)}'
WHERE user_id = '${userId ?? 'FIND BY EMAIL'}';
`.trim();

    try {
      await this.transporter.sendMail({
        from:    this.config.get<string>('SMTP_FROM', 'noreply@linguacard.app'),
        to:      this.toEmail,
        subject,
        text:    body,
      });
      this.logger.log(`Upgrade request email sent for ${dto.email}`);
    } catch (err) {
      // Log but don't throw — the user already submitted the form successfully
      this.logger.error('Failed to send upgrade email', err);
    }
  }
}
```

```typescript
// apps/api/src/contact/contact.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ContactService } from './contact.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import type { UpgradeRequestDto } from '@lingua-card/shared/domain';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Public so unauthenticated users can also request upgrade
  @Public()
  @Post('upgrade')
  async requestUpgrade(
    @Body() dto: UpgradeRequestDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<{ ok: boolean }> {
    await this.contactService.sendUpgradeRequest(dto, user?.userId);
    return { ok: true };
  }
}
```

```typescript
// apps/api/src/contact/contact.module.ts
import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  providers: [ContactService],
  controllers: [ContactController],
})
export class ContactModule {}
```

Register `ContactModule` in `AppModule`.

### Acceptance criteria

- [ ] `POST /api/v1/contact/upgrade` with `{ name, email, message }` returns `{ ok: true }` and sends an email
- [ ] Email arrives at `kennethnnalue.dev@gmail.com` with name, email, user ID, message, and copy-pasteable SQL snippet
- [ ] If SMTP fails, the endpoint still returns `{ ok: true }` (fire-and-forget — user shouldn't see an error for a mail failure)
- [ ] Endpoint is `@Public()` — works without JWT token
- [ ] `tsc --noEmit` passes
- [ ] Manual test: submit form with valid SMTP credentials and confirm email received

---

---

## LC-109 · `SubscriptionStore` (Angular signal store)

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 3
**Depends on:** LC-106, LC-110

### User story

As the Angular app, I want a `SubscriptionStore` that holds the current user's subscription status in reactive signals, so that any component can read the tier and story count without making repeated HTTP calls.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/subscription/store/subscription.store.ts` | Signal store |
| `apps/mobile/src/app/features/subscription/index.ts` | Barrel export |

### Implementation

```typescript
// apps/mobile/src/app/features/subscription/store/subscription.store.ts
import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed } from '@ngrx/signals';
import { patchState } from '@ngrx/signals';
import { computed } from '@angular/core';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';
import { SubscriptionApiService } from '../services/subscription-api.service';

interface SubscriptionState {
  status:    SubscriptionStatus | null;
  isLoading: boolean;
  error:     string | null;
}

const initialState: SubscriptionState = {
  status:    null,
  isLoading: false,
  error:     null,
};

export const SubscriptionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ status }) => ({
    tier:             computed(() => status()?.tier ?? 'free'),
    isPro:            computed(() => status()?.isActive ?? false),
    storiesRemaining: computed(() => status()?.storiesRemaining ?? 3),
    canGenerateStory: computed(() => {
      const s = status();
      if (!s) return true;              // optimistic before loaded
      if (s.isActive) return true;      // pro — unlimited
      return (s.storiesRemaining ?? 0) > 0;
    }),
  })),

  withMethods((store) => {
    const api = inject(SubscriptionApiService);
    return {
      loadStatus(): void {
        patchState(store, { isLoading: true, error: null });
        api.getMyStatus().subscribe({
          next: (status) => patchState(store, { status, isLoading: false }),
          error: ()       => patchState(store, { isLoading: false, error: 'Failed to load subscription' }),
        });
      },
      // Called after a story is successfully generated — decrements locally without re-fetching
      onStoryGenerated(): void {
        const current = store.status();
        if (!current || current.isActive) return;
        patchState(store, {
          status: {
            ...current,
            storiesGenerated:  current.storiesGenerated + 1,
            storiesRemaining:  Math.max(0, (current.storiesRemaining ?? 0) - 1),
          },
        });
      },
    };
  }),
);
```

### Load on app start

```typescript
// apps/mobile/src/app/app.component.ts — add to ngOnInit or after auth
// Inject SubscriptionStore and call loadStatus() after the user is authenticated
private readonly subscriptionStore = inject(SubscriptionStore);

ngOnInit(): void {
  // ... existing init
  if (this.authStore.isAuthenticated()) {
    this.subscriptionStore.loadStatus();
  }
}
```

### Acceptance criteria

- [ ] `SubscriptionStore` is `providedIn: 'root'`
- [ ] `tier` signal returns `'free'` or `'pro'`
- [ ] `isPro` signal returns `true` only when `status.isActive === true`
- [ ] `canGenerateStory` returns `true` for pro users; `true` for free users with stories remaining; `false` for free users at limit
- [ ] `onStoryGenerated()` decrements `storiesRemaining` locally without an HTTP call
- [ ] `loadStatus()` sets `isLoading` during the fetch and clears it on completion
- [ ] `tsc --noEmit` passes

---

---

## LC-110 · `SubscriptionApiService`

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 1
**Depends on:** LC-106

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/subscription/services/subscription-api.service.ts` | HTTP client |

### Implementation

```typescript
// apps/mobile/src/app/features/subscription/services/subscription-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/subscriptions`;

  getMyStatus(): Observable<SubscriptionStatus> {
    return this.http.get<SubscriptionStatus>(`${this.baseUrl}/me`);
  }
}
```

### Acceptance criteria

- [ ] `getMyStatus()` calls `GET /api/v1/subscriptions/me` and returns `Observable<SubscriptionStatus>`
- [ ] Uses `environment.apiUrl` — no hardcoded URL

---

---

## LC-111 · `PaywallModalComponent`

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 3
**Depends on:** LC-109

### User story

As a free-tier user who has used all 3 story generations, when I tap "Generate Story", I want to see a clear, friendly modal that explains the Pro upgrade and lets me contact Kenneth to request access.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/subscription/components/paywall-modal/paywall-modal.component.ts` | Component TS |
| `apps/mobile/src/app/features/subscription/components/paywall-modal/paywall-modal.component.html` | Template |
| `apps/mobile/src/app/features/subscription/components/paywall-modal/paywall-modal.component.scss` | Styles |

### Design spec

The modal uses `ion-modal` (bottom sheet style, `breakpoints: [0, 1]`, `initialBreakpoint: 1`).

```
┌─────────────────────────────────────┐
│  ✦ Unlock Unlimited Stories         │ ← Lora display font
│                                     │
│  You've used your 3 free stories.   │
│  Upgrade to Pro for:                │
│                                     │
│  ✓  Unlimited story generation      │
│  ✓  Claude Sonnet — highest quality │
│  ✓  Priority support                │
│                                     │
│  ┌─────────────────────────────┐    │
│  │    Request Pro Access   →   │    │ ← filled-accent lc-button
│  └─────────────────────────────┘    │
│                                     │
│  Not now                            │ ← ghost button
└─────────────────────────────────────┘
```

### Component implementation

```typescript
// paywall-modal.component.ts
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { IonContent, IonHeader, IonToolbar, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, closeOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { UpgradeContactSheetComponent } from '../upgrade-contact-sheet/upgrade-contact-sheet.component';

@Component({
  selector: 'lc-paywall-modal',
  templateUrl: './paywall-modal.component.html',
  styleUrls: ['./paywall-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, ButtonComponent],
})
export class PaywallModalComponent {
  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ sparklesOutline, closeOutline, checkmarkCircleOutline });
  }

  async openContactSheet(): Promise<void> {
    await this.modalCtrl.dismiss();           // close paywall first
    const sheet = await this.modalCtrl.create({
      component: UpgradeContactSheetComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await sheet.present();
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
```

### Acceptance criteria

- [ ] Modal opens as a bottom sheet (`breakpoints: [0, 1]`, `initialBreakpoint: 1`)
- [ ] Shows the 3 Pro benefits bullet list
- [ ] "Request Pro Access" button dismisses this modal and opens `UpgradeContactSheetComponent`
- [ ] "Not now" dismisses the modal with no side effects
- [ ] Component uses `ChangeDetectionStrategy.OnPush`
- [ ] All SCSS uses LDS tokens (`t.$lc-*`), no raw values
- [ ] Component uses `<lc-button>` — no custom button CSS

---

---

## LC-112 · `UpgradeContactSheetComponent`

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 3
**Depends on:** LC-108, LC-111

### User story

As a free-tier user requesting Pro access, I want a simple form where I can enter my name, email, and an optional message, so that Kenneth receives my upgrade request by email and can activate my account.

### Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/src/app/features/subscription/components/upgrade-contact-sheet/upgrade-contact-sheet.component.ts` | Component TS |
| `apps/mobile/src/app/features/subscription/components/upgrade-contact-sheet/upgrade-contact-sheet.component.html` | Template |
| `apps/mobile/src/app/features/subscription/components/upgrade-contact-sheet/upgrade-contact-sheet.component.scss` | Styles |
| `apps/mobile/src/app/features/subscription/services/contact-api.service.ts` | HTTP client |

### Design spec

```
┌──────────────────────────────────────┐
│  Request Pro Access                  │ ← toolbar title
│  ─────────────────────────────────── │
│                                      │
│  Name *                              │
│  ┌────────────────────────────────┐  │
│  │ Your name                      │  │
│  └────────────────────────────────┘  │
│                                      │
│  Email *                             │
│  ┌────────────────────────────────┐  │
│  │ your@email.com                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  Message (optional)                  │
│  ┌────────────────────────────────┐  │
│  │ Tell us how you plan to use    │  │
│  │ LinguaCard…                    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │      Send Request           →  │  │ ← filled-primary lc-button, loading state
│  └────────────────────────────────┘  │
│                                      │
│  ✓ Sent! Kenneth will be in touch.   │ ← success state replaces form
└──────────────────────────────────────┘
```

### Component implementation

```typescript
// upgrade-contact-sheet.component.ts
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { ContactApiService } from '../../services/contact-api.service';

@Component({
  selector: 'lc-upgrade-contact-sheet',
  templateUrl: './upgrade-contact-sheet.component.html',
  styleUrls: ['./upgrade-contact-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, ReactiveFormsModule, ButtonComponent],
})
export class UpgradeContactSheetComponent {
  private readonly modalCtrl  = inject(ModalController);
  private readonly contactApi = inject(ContactApiService);
  private readonly fb         = inject(FormBuilder);

  readonly isSubmitting = signal(false);
  readonly submitted    = signal(false);
  readonly error        = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    email:   ['', [Validators.required, Validators.email]],
    message: [''],
  });

  constructor() {
    addIcons({ closeOutline, checkmarkCircleOutline });
  }

  send(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.error.set(null);

    this.contactApi.sendUpgradeRequest(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submitted.set(true);
        // Auto-dismiss after 2.5 seconds
        setTimeout(() => this.modalCtrl.dismiss({ submitted: true }), 2500);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.error.set('Something went wrong. Please try again or email kennethnnalue.dev@gmail.com directly.');
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
```

```typescript
// services/contact-api.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { UpgradeRequestDto } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class ContactApiService {
  private readonly http = inject(HttpClient);

  sendUpgradeRequest(dto: UpgradeRequestDto): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${environment.apiUrl}/contact/upgrade`, dto);
  }
}
```

### Acceptance criteria

- [ ] Form has `name` (required), `email` (required, email validator), `message` (optional)
- [ ] "Send Request" button is disabled while `isSubmitting` is true; shows spinner
- [ ] On success: form is replaced with a success message; sheet auto-closes after 2.5 seconds
- [ ] On error: shows error message with Kenneth's direct email as fallback
- [ ] Component uses `ChangeDetectionStrategy.OnPush` and `ReactiveFormsModule`
- [ ] All SCSS uses LDS tokens — no raw px/hex values
- [ ] Email field is pre-filled with the logged-in user's email (inject `AuthStore`, read `user().email`)

---

---

## LC-113 · Paywall guard on `GenerateStorySheetComponent`

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 2
**Depends on:** LC-109, LC-111

### User story

As the app, when the user taps "Generate Story", I want to check if they can generate before opening the sheet, and if not, show the paywall modal instead.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/pages/story-library/story-library.page.ts` | Inject `SubscriptionStore`; guard `openGenerateSheet()` |

### Implementation

```typescript
// story-library.page.ts — modify openGenerateSheet()

private readonly subscriptionStore = inject(SubscriptionStore);

async openGenerateSheet(): Promise<void> {
  // Check paywall before opening the generate sheet
  if (!this.subscriptionStore.canGenerateStory()) {
    const modal = await this.modalCtrl.create({
      component: PaywallModalComponent,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
    });
    await modal.present();
    return;   // do NOT open the generate sheet
  }

  // Existing code unchanged below this line
  const modal = await this.modalCtrl.create({
    component: GenerateStorySheetComponent,
    // ...
  });
  await modal.present();

  const { data } = await modal.onWillDismiss();
  if (data?.generated) {
    this.subscriptionStore.onStoryGenerated();  // ← update count locally
  }
}
```

### Also update `GenerateStorySheetComponent` to pass `{ generated: true }` on dismiss

```typescript
// generate-story-sheet.component.ts — in the success path after story generation
await this.modalCtrl.dismiss({ generated: true });
```

### Acceptance criteria

- [ ] Tapping "Generate Story" when `canGenerateStory() === false` opens `PaywallModalComponent`, NOT the generate sheet
- [ ] Tapping "Generate Story" when `canGenerateStory() === true` opens `GenerateStorySheetComponent` as before
- [ ] After a story is successfully generated, `subscriptionStore.onStoryGenerated()` is called
- [ ] The next tap of "Generate Story" after the 3rd free story shows the paywall immediately
- [ ] Pro users never see the paywall

---

---

## LC-114 · Tier badge in `UserMenuComponent`

**Epic:** Subscription & Paywall
**Phase:** 2 — Angular
**Points:** 1
**Depends on:** LC-109

### User story

As a user, I want to see my current tier (FREE or PRO) next to my name in the user menu, so that I know my account status at a glance.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/shared/components/user-menu/user-menu.component.ts` | Inject `SubscriptionStore` |
| `apps/mobile/src/app/shared/components/user-menu/user-menu.component.html` | Add tier badge |
| `apps/mobile/src/app/shared/components/user-menu/user-menu.component.scss` | Add badge styles |

### Template change

Add this below the user's name in the existing user menu header:

```html
<!-- After user name display -->
<span
  class="tier-badge"
  [class.tier-badge--pro]="subscriptionStore.isPro()"
>
  {{ subscriptionStore.isPro() ? 'PRO' : 'FREE' }}
</span>
```

```scss
// user-menu.component.scss
@use '../../../../theme/tokens' as t;

.tier-badge {
  display: inline-block;
  font-size: t.$lc-font-size-xs;
  font-weight: t.$lc-font-weight-semibold;
  padding: t.$lc-space-1 t.$lc-space-2;
  border-radius: t.$lc-radius-sm;
  background: t.$lc-surface-alt;
  color: t.$lc-text-secondary;
  letter-spacing: 0.06em;
  text-transform: uppercase;

  &--pro {
    background: t.$lc-brand;
    color: t.$lc-text-inverse;
  }
}
```

### Acceptance criteria

- [ ] Free user sees a muted "FREE" pill badge next to their name
- [ ] Pro user sees a green "PRO" pill badge using the LDS brand colour
- [ ] Badge updates reactively if tier changes (uses signal, no manual subscription)
- [ ] All SCSS uses LDS tokens

---

---

## LC-115 · Auto-create `free` subscription on user registration

**Epic:** Subscription & Paywall
**Phase:** 3 — Auth integration
**Points:** 2
**Depends on:** LC-105

### User story

As the system, when a new user registers, I want a `free` subscription row created automatically, so that `GET /subscriptions/me` never needs to create one on-the-fly.

### Files to modify

| File | Change |
|------|--------|
| `apps/api/src/auth/auth.service.ts` | Inject `SubscriptionService`; call `createFree()` after user save |
| `apps/api/src/auth/auth.module.ts` | Import `SubscriptionsModule` |

### Implementation

```typescript
// apps/api/src/auth/auth.service.ts

// Add injection
constructor(
  @InjectRepository(UserEntity)
  private readonly userRepo: Repository<UserEntity>,
  private readonly jwtService: JwtService,
  private readonly subscriptions: SubscriptionService,  // ← new
) {}

async register(dto: RegisterDto): Promise<AuthResponse> {
  // ... existing validation and user creation ...
  const saved = await this.userRepo.save(entity);

  // Auto-create free subscription
  await this.subscriptions.createFree(saved.id);   // ← add this line

  return this.buildResponse(saved);
}
```

```typescript
// apps/api/src/auth/auth.module.ts
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({ /* unchanged */ }),
    SubscriptionsModule,   // ← add
  ],
  // ...
})
export class AuthModule {}
```

### Acceptance criteria

- [ ] Registering a new user creates one row in `subscriptions` with `tier = 'free'`
- [ ] `GET /subscriptions/me` for a newly registered user returns the free status without creating a row on the fly
- [ ] Existing users without a subscription row still get one created on first `GET /subscriptions/me` call (the `getOrCreateForUser` fallback in LC-105)
- [ ] `tsc --noEmit` passes
- [ ] No circular dependency between `AuthModule` and `SubscriptionsModule`

---

---

## LC-116 · Story count display on generate sheet (free users)

**Epic:** Subscription & Paywall
**Phase:** 4 — Polish
**Points:** 1
**Depends on:** LC-109, LC-113

### User story

As a free-tier user, I want to see "2 of 3 free stories used" at the top of the generate sheet, so that I know how many I have left before being shown a paywall.

### Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.ts` | Inject `SubscriptionStore` |
| `apps/mobile/src/app/features/stories/components/generate-story-sheet/generate-story-sheet.component.html` | Add free tier usage bar |

### Template addition (top of `ion-content`)

```html
<!-- Show only for free users -->
@if (!subscriptionStore.isPro()) {
  <div class="free-usage-bar">
    <span class="free-usage-text">
      {{ subscriptionStore.status()?.storiesGenerated ?? 0 }} of {{ subscriptionStore.status()?.freeStoryLimit ?? 3 }}
      free stories used
    </span>
    <div class="free-usage-track">
      <div
        class="free-usage-fill"
        [style.width.%]="((subscriptionStore.status()?.storiesGenerated ?? 0) / (subscriptionStore.status()?.freeStoryLimit ?? 3)) * 100"
      ></div>
    </div>
  </div>
}
```

### Acceptance criteria

- [ ] Free users see the usage bar at the top of the generate sheet
- [ ] Bar fills proportionally (0 stories = empty, 2 of 3 = ~67% filled, 3 of 3 = full but should not appear — paywall intercepts)
- [ ] Pro users see nothing (the `@if` block is not rendered)
- [ ] All SCSS uses LDS tokens

---

---

## LC-117 · `env.example` + Render env for email config

**Epic:** Subscription & Paywall
**Phase:** 4 — Polish
**Points:** 1
**Depends on:** LC-108

### Files to modify

| File | Change |
|------|--------|
| `apps/api/.env.example` | Add SMTP variables |
| `render.yaml` | Add SMTP env var entries |

### env.example additions

```bash
# ── Contact / Upgrade Email ────────────────────────────────────────────────────
# Uses Gmail with an App Password (not your account password).
# 1. Enable 2FA on the Gmail account: myaccount.google.com/security
# 2. Create an App Password: myaccount.google.com/apppasswords
#    Name: LinguaCard API
# 3. Paste the 16-char app password below (no spaces)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=                              # Gmail address (e.g. kennethnnalue.dev@gmail.com)
SMTP_PASS=                              # 16-char Gmail App Password (not account password)
SMTP_FROM=noreply@linguacard.app        # Display name in sent emails
```

### render.yaml additions

```yaml
- key: SMTP_HOST
  value: smtp.gmail.com
- key: SMTP_PORT
  value: "587"
- key: SMTP_USER
  sync: false   # paste Gmail address in Render dashboard
- key: SMTP_PASS
  sync: false   # paste Gmail App Password in Render dashboard
- key: SMTP_FROM
  value: noreply@linguacard.app
```

### Acceptance criteria

- [ ] `.env.example` has all 5 SMTP variables with clear setup instructions
- [ ] `render.yaml` has corresponding entries with `sync: false` for secrets
- [ ] Gmail App Password setup steps are documented in comments

---

---

## LC-118 · Unit tests for tier routing + subscription service

**Epic:** Subscription & Paywall
**Phase:** 5 — Tests
**Points:** 2
**Depends on:** LC-107, LC-105

### Files to create

| File | Purpose |
|------|---------|
| `apps/api/src/subscriptions/subscription.service.spec.ts` | Service unit tests |
| `apps/api/src/stories/story-generation.service.spec.ts` | Tier routing tests |

### Key test cases

```typescript
// subscription.service.spec.ts

describe('getStatusForUser()', () => {
  it('returns free tier with correct stories remaining for a new user', async () => { ... });
  it('returns storiesRemaining = null for an active pro user', async () => { ... });
  it('returns isActive = false when expiresAt is in the past', async () => { ... });
  it('creates a free subscription if one does not exist', async () => { ... });
});

describe('getEffectiveTier()', () => {
  it('returns pro for active pro user', async () => { ... });
  it('returns free for expired pro user', async () => { ... });
  it('returns free for free user', async () => { ... });
});

// story-generation.service.spec.ts

describe('generateAndSave() tier routing', () => {
  it('uses AnthropicAdapter for pro users', async () => { ... });
  it('uses GeminiAdapter for free users', async () => { ... });
  it('throws ForbiddenException when free user has 0 stories remaining', async () => { ... });
  it('allows free user with 2 of 3 stories used to generate', async () => { ... });
});
```

### Acceptance criteria

- [ ] All test cases pass with `nx test api`
- [ ] Tier routing tests use Jest mocks for `SubscriptionService` and adapters
- [ ] No real HTTP calls or DB connections in unit tests

---

## Implementation order

Work through these in exactly this sequence to avoid blocked dependencies:

1. **LC-103** — Shared types (unblocks everything — do first)
2. **LC-104** — SubscriptionEntity + module scaffold
3. **LC-105** — SubscriptionService business logic
4. **LC-115** — Auto-create on registration (wire auth + subscription together)
5. **LC-106** — SubscriptionController (GET /subscriptions/me)
6. **LC-107** — Tier-aware textProvider in StoryGenerationService
7. **LC-108** — ContactController + email sending
8. **LC-117** — env.example + render.yaml (do alongside LC-108)
9. **LC-110** — SubscriptionApiService (Angular)
10. **LC-109** — SubscriptionStore (Angular)
11. **LC-111** — PaywallModalComponent
12. **LC-112** — UpgradeContactSheetComponent
13. **LC-113** — Paywall guard on GenerateStorySheetComponent
14. **LC-114** — Tier badge in UserMenuComponent
15. **LC-116** — Story count bar in generate sheet
16. **LC-118** — Unit tests (write after all implementation is stable)

---

## Non-goals for this epic

- No payment processor (Stripe, Paddle, etc.) — manual activation only
- No self-serve subscription management UI (no cancel/pause/plan-change screens)
- No webhooks or automated expiry notifications
- No admin dashboard — Kenneth uses direct SQL queries
- No trial periods — users go straight to `free` tier
- No per-collection or per-feature gating beyond story generation
- No rate limiting beyond the 3-story free limit
- No subscription history or invoice generation

---

## CLAUDE.md update required after this epic

Add to the **Epics & feature status** table:

```markdown
| 12 | Subscription & Paywall | ✅ Implemented | `features/subscription/`, `apps/api/src/subscriptions/`, `apps/mobile/epic-subscription-paywall.md` |
```

Add to the **Documentation map**:

```markdown
| `apps/mobile/epic-subscription-paywall.md` | Subscription & Paywall epic — LC-103 to LC-118 |
```
