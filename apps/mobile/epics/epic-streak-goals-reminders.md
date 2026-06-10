# Epic: Daily Streak, Study Goals & Web Reminders

**A Duolingo-style daily streak driven by configurable review goals, plus web push reminders**

| Field | Value |
|---|---|
| Epic ID | LC-350 → LC-368 |
| Total points | 48 |
| Depends on | Session sync (`reviewSessions`) — already implemented |
| Platform scope | Web (PWA) only. iOS/Android push deferred. |
| Files touched | `libs/shared/domain`, `apps/api/src/{settings,stats,push}/`, `apps/api/src/auth/`, `apps/mobile/src/app/{core,features/home,features/settings,shared/srs}/` |

---

## 1. Context & problem statement

The product owner wants three connected things:

1. **A persistent daily streak like Duolingo** — the current streak "is only weekly and resets weekly".
2. **Configurable daily / weekly / monthly review targets** with sensible defaults.
3. **Web notifications** that pull the user back into the app to do their reviews (web only for now).

### What the codebase actually does today

Investigation of `ReviewStatsStore` (`apps/mobile/src/app/shared/srs/review-stats.store.ts`) shows a streak **already exists** and is computed in local time:

```
dayStreak = consecutive local days (with a 1-day "yesterday" grace)
            where AT LEAST ONE review session was completed
```

Sessions already persist to the backend `reviewSessions` table (`ReviewSessionsService.upsert`, idempotent) and survive reinstall. So the data layer is sound. The problem is **semantic and presentational**, not "the streak resets weekly" literally:

| Observed problem | Root cause |
|---|---|
| Streak feels "weekly" | The home screen frames everything around the `MO–SU` "This week" chart and a hardcoded `Goal: 150`. The streak is shown only as 7 small dots, reinforcing a 7-day mental model. |
| Streak feels trivial / easy to keep | A day counts toward the streak if **any** session was completed — even one card. There is no goal gating it, so it doesn't feel earned the way a Duolingo streak does. |
| No way to set a target | `Goal: 150` is a hardcoded constant in the home template. There is no `study_goals` / `user_settings` table; `UserEntity` has only `id/email/name/passwordHash/avatarInitials`. |
| No reminders | There is no notification infrastructure at all. A PWA manifest exists (`apps/mobile/src/manifest.webmanifest`) but no service-worker push handling. |

### What this epic changes

- **The streak becomes goal-driven.** A day counts toward the streak only when the user hits their **daily review goal** — exactly the Duolingo mechanic. This is the single most important change.
- **The streak becomes server-authoritative**, computed from `reviewSessions`, so it is correct across devices and reinstalls *and* so the reminder scheduler can ask "who hasn't hit their goal today?"
- **A new `user_settings` table** stores daily/weekly/monthly goals + reminder preferences, created on registration with defaults.
- **Web Push (VAPID)** delivers reminders that fire even when the app/tab is closed.
- **The home screen is reframed** around the daily streak and daily goal progress, with milestone celebrations.

---

## 2. Architecture Decision Records

### ADR-1: A streak day = the daily goal was met, not "any activity"

**Decision:** A calendar day (local time) counts toward the streak only if `cardsReviewedThatDay >= dailyGoal`. "Cards reviewed" uses the existing canonical metric: **distinct cards rated, bucketed by local day** (per the review-system reconciliation epic §3.5).

**Rationale:** This is the defining Duolingo mechanic and the thing that makes a streak feel earned. A streak you keep by reviewing one card is not motivating. Tying the streak to the goal also unifies features 1 and 2 — the goal *is* the streak rule.

**Consequences:** Existing users' streaks may recompute lower the first time (a day where they did 3 cards but the goal is 20 no longer counts). This is correct and expected. We surface a one-time explainer ("Streaks now count days you hit your goal").

### ADR-2: Streak & goal-progress are computed server-side from `reviewSessions`

**Decision:** Add a backend `StatsService` that computes `StreakStatus` and `GoalProgress` from the `reviewSessions` table. The mobile `ReviewStatsStore` keeps an optimistic local computation for instant UI and reconciles against the server value on load/sync.

**Rationale:** (a) The streak must survive reinstall and be consistent across devices — only the server has the full history (local history is capped at `MAX_SESSION_HISTORY = 50`). (b) The reminder scheduler (ADR-5) runs server-side and needs to know who has/hasn't hit their goal today; that logic must live where the cron runs. Computing it twice (client optimistic + server authoritative) is the established offline-first pattern in this codebase.

**Consequences:** One new read path (`GET /stats/streak`). The client treats the server value as the source of truth; the optimistic value only fills the gap between completing a session and the next sync.

### ADR-3: Goals live in a new one-to-one `user_settings` table, not columns on `users`

**Decision:** Create `user_settings` (one row per user, `ON DELETE CASCADE`, unique `user_id`), holding `dailyGoal`, `weeklyGoal`, `monthlyGoal`, `remindersEnabled`, `reminderTime`, `timezone`. Created with defaults on registration, mirroring how `subscriptions` is created in `AuthService.register()`.

**Rationale:** Settings will keep growing (reminder prefs now, more later). Keeping `users` lean and following the existing `subscriptions` pattern (separate table, same lifecycle hook) is consistent with the codebase. A separate table also lets us evolve settings without migrating the auth table.

**Consequences:** New table + module + service + controller. Registration gains one more `await` (create default settings), same as it already does for `subscriptions.createFree()`.

**Defaults:** `dailyGoal = 20`, `weeklyGoal = 120` (6 active days × 20), `monthlyGoal = 500`. All three are independently editable; we do not force `weekly = 7 × daily` so a user can plan rest days.

### ADR-4: Use Web Push (VAPID), not the client-scheduled Notifications API

**Decision:** Reminders are delivered via the Web Push protocol with VAPID keys: a backend scheduler sends a push → the browser push service wakes the service worker → the SW `push` handler calls `showNotification()`. We use Angular's `@angular/service-worker` `SwPush` on the client.

**Rationale:** The entire point of the reminder is to bring back a user whose **app is closed**. The Notifications API scheduled with `setTimeout` only fires while a tab/SW is alive — useless once the tab is closed. Web Push is the only mechanism that delivers to a closed PWA. `SwPush` gives us `requestSubscription({ serverPublicKey })`, `messages`, and `notificationClicks` out of the box, and `ngsw-worker.js` handles the `push`/`notificationclick` events natively.

**Consequences:** Requires a VAPID keypair (generated once, public key shipped to client, private key in env), a `push_subscriptions` table, a server-side `web-push` send path, and registration of the Angular service worker (`provideServiceWorker('ngsw-worker.js', …)`). iOS Safari supports Web Push only for **installed** (Add to Home Screen) PWAs on iOS 16.4+; we document this limitation rather than solving native iOS/Android in this epic.

### ADR-5: Reminders are sent by an hourly server cron that checks goal status

**Decision:** A `ReminderSchedulerService` using `@nestjs/schedule` runs **hourly**. For each user whose local `reminderTime` falls in the current hour, who has `remindersEnabled`, who has at least one push subscription, and who has **not yet hit today's daily goal**, it sends one reminder push. A per-user "last reminded on" guard prevents duplicates.

**Rationale:** Running hourly and matching against a per-user `reminderTime` + `timezone` avoids a global fixed send time and handles all timezones with one simple job. Gating on "has not hit the daily goal" means we never nag someone who already did their reviews — and it directly reuses the ADR-2 goal-progress computation.

**Consequences:** We store `reminderTime` (e.g. `"19:00"`) and `timezone` (IANA, e.g. `"Europe/Berlin"`) per user. The cron converts "now" into each candidate user's local time. Stale subscriptions returning `410 Gone` are pruned automatically.

### ADR-6: Keep a one-day "rest day" grace, surfaced as an explicit "at-risk" state

**Decision:** The streak is not broken the instant a day passes goal-less. If the goal was met yesterday but not yet today, the streak is **at risk** (preserved until local midnight). It only breaks if a full day passes with the goal unmet. The UI shows an explicit "Do your reviews to keep your N-day streak" state.

**Rationale:** This matches the forgiving feel of Duolingo (which sells streak freezes) without building a freeze economy. The existing code already has a "yesterday grace" offset; we formalize it as a first-class `atRisk` state rather than an implicit calculation.

**Consequences:** `StreakStatus` carries `state: 'safe' | 'at_risk' | 'broken'`. We do **not** build purchasable streak freezes in this epic (non-goal).

---

## 3. Target architecture

```
                         ┌─────────────────────────────────┐
                         │  reviewSessions (existing table) │
                         └──────────────┬──────────────────┘
                                        │ read
                       ┌────────────────▼─────────────────┐
   GET /stats/streak   │  StatsService (NEW)              │
   GET /stats/goal     │  computeStreak(userId, goals)    │
                       │  computeGoalProgress(userId)     │
                       └────────────────┬─────────────────┘
                                        │ uses
                       ┌────────────────▼─────────────────┐
   GET  /settings/me   │  UserSettingsService (NEW)       │
   PATCH/settings/me   │  goals + reminder prefs          │
                       └──────────────────────────────────┘

   POST /push/subscribe        ┌──────────────────────────┐
   DELETE /push/unsubscribe    │  PushService (NEW)        │
   GET  /push/vapid-public-key │  store/prune subscriptions│
                               └──────────┬────────────────┘
                                          │
   @Cron('0 * * * *')          ┌──────────▼────────────────┐
                               │ ReminderSchedulerService   │
                               │ hourly → per-user local    │
                               │ time → goal unmet → push   │
                               └────────────────────────────┘

  CLIENT (PWA)
  ───────────
  SettingsStore ──── GET/PATCH /settings/me
  ReviewStatsStore ─ optimistic streak + reconcile w/ GET /stats/streak
  PushService ────── SwPush.requestSubscription() → POST /push/subscribe
  ngsw-worker.js ─── push event → showNotification() → click → focus app
```

---

## 4. Story map

| Phase | Ticket | Title | Points |
|---|---|---|---|
| 0 — Domain | LC-350 | Shared types: `StudyGoals`, `StreakStatus`, `GoalProgress`, push DTOs | 2 |
| 1 — Backend goals | LC-351 | `UserSettingsEntity` + module | 2 |
| 1 — Backend goals | LC-352 | `UserSettingsService` (get/upsert + create-on-register) | 3 |
| 1 — Backend goals | LC-353 | `UserSettingsController` (GET/PATCH /settings/me) | 2 |
| 2 — Backend streak | LC-354 | `StatsService.computeStreak()` — goal-based daily streak | 5 |
| 2 — Backend streak | LC-355 | `StatsController` (GET /stats/streak, /stats/goal-progress) | 2 |
| 3 — Backend push | LC-356 | VAPID keys + `web-push` config | 1 |
| 3 — Backend push | LC-357 | `PushSubscriptionEntity` + `PushService` | 2 |
| 3 — Backend push | LC-358 | `PushController` (subscribe/unsubscribe/public-key) | 2 |
| 3 — Backend push | LC-359 | `ReminderSchedulerService` — hourly goal-gated cron | 5 |
| 4 — Mobile settings | LC-360 | `SettingsStore` + `SettingsApiService` | 3 |
| 4 — Mobile settings | LC-361 | Study-goals settings UI (daily/weekly/monthly) | 3 |
| 5 — Mobile streak | LC-362 | `ReviewStatsStore`: goal-based streak + server reconcile | 3 |
| 5 — Mobile streak | LC-363 | Home redesign: streak ring + daily goal progress + at-risk | 3 |
| 5 — Mobile streak | LC-364 | Streak milestone celebration modal | 2 |
| 6 — Mobile push | LC-365 | Register Angular SW + push/notificationclick handling | 2 |
| 6 — Mobile push | LC-366 | `PushService` (permission, subscribe, sync to backend) | 3 |
| 6 — Mobile push | LC-367 | Reminder settings UI (toggle + time picker) | 2 |
| 7 — Docs | LC-368 | Update `CLAUDE.md` | 1 |

**Total: 48 points**

---

## 5. Implementation order

```
LC-350 (domain)
  ├─> LC-351 → LC-352 → LC-353         (goals backend)
  │      └─> LC-354 → LC-355           (streak backend, needs goals)
  ├─> LC-356 → LC-357 → LC-358         (push backend)
  │      └─> LC-359                    (scheduler, needs push + stats + settings)
  └─> LC-360 → LC-361                  (settings mobile, needs LC-353)
         └─> LC-362 → LC-363 → LC-364  (streak mobile, needs LC-355)
         └─> LC-365 → LC-366 → LC-367  (push mobile, needs LC-358)
                └─> LC-368             (docs)
```

Backend goals (LC-351–353) and backend push (LC-356–358) can be built in parallel. Each ticket leaves `tsc --noEmit` green across `apps/api` and `apps/mobile`.

---

---

## LC-350 · Shared types

**Phase:** 0 — Domain · **Points:** 2 · **Depends on:** nothing

### User story
As a developer, I want goals, streak, goal-progress, and push types in `@lingua-card/shared/domain` so backend and mobile share one contract before any feature is built.

### Files to modify
| File | Change |
|---|---|
| `libs/shared/domain/src/index.ts` | Add the types below |

### Implementation
```typescript
// libs/shared/domain/src/index.ts

// ─── STUDY GOALS & REMINDERS ──────────────────────────────────────────────────

export interface StudyGoals {
  dailyGoal: number;    // cards/day to keep the streak (default 20)
  weeklyGoal: number;   // cards/week target (default 120)
  monthlyGoal: number;  // cards/month target (default 500)
}

export interface ReminderSettings {
  remindersEnabled: boolean;  // master toggle (default false until permission granted)
  reminderTime: string;       // local "HH:mm", 24h (default "19:00")
  timezone: string;           // IANA tz, e.g. "Europe/Berlin"
}

/** Full settings row returned by GET /settings/me. */
export interface UserSettings extends StudyGoals, ReminderSettings {
  userId: string;
}

/** Partial update accepted by PATCH /settings/me. */
export type UpdateUserSettingsDto = Partial<StudyGoals & ReminderSettings>;

export const DEFAULT_STUDY_GOALS: StudyGoals = {
  dailyGoal: 20,
  weeklyGoal: 120,
  monthlyGoal: 500,
};

export const DEFAULT_REMINDER_SETTINGS: Omit<ReminderSettings, 'timezone'> = {
  remindersEnabled: false,
  reminderTime: '19:00',
};

// ─── STREAK & GOAL PROGRESS ───────────────────────────────────────────────────

export type StreakState = 'safe' | 'at_risk' | 'broken';

export interface StreakStatus {
  current: number;          // consecutive goal-met days, including today if met
  longest: number;          // best streak ever
  state: StreakState;       // safe = goal met today; at_risk = met yesterday not today; broken = 0
  lastGoalMetDate: string | null;  // local day key "YYYY-MM-DD"
}

export interface GoalProgress {
  period: 'daily' | 'weekly' | 'monthly';
  reviewed: number;   // distinct cards reviewed this period (local time)
  goal: number;
  metGoal: boolean;
}

// ─── WEB PUSH ─────────────────────────────────────────────────────────────────

/** Mirrors the browser PushSubscription.toJSON() shape. */
export interface PushSubscriptionDto {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}
```

### Acceptance criteria
- [ ] `StudyGoals`, `ReminderSettings`, `UserSettings`, `UpdateUserSettingsDto`, `StreakStatus`, `StreakState`, `GoalProgress`, `PushSubscriptionDto`, `DEFAULT_STUDY_GOALS`, `DEFAULT_REMINDER_SETTINGS` exported from `@lingua-card/shared/domain`
- [ ] `tsc --noEmit` passes in `libs/shared/domain/`, `apps/api/`, `apps/mobile/`
- [ ] No existing types broken

---

---

## LC-351 · `UserSettingsEntity` + module

**Phase:** 1 — Backend goals · **Points:** 2 · **Depends on:** LC-350

### User story
As a developer, I want a `user_settings` table so each user has persistent goals and reminder preferences.

### Files to create
| File | Purpose |
|---|---|
| `apps/api/src/settings/user-settings.entity.ts` | TypeORM entity |
| `apps/api/src/settings/settings.module.ts` | NestJS module |

### Implementation
```typescript
// apps/api/src/settings/user-settings.entity.ts
import {
  Entity, PrimaryColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { UserEntity } from '../auth/user.entity';

@Entity('user_settings')
export class UserSettingsEntity {
  // One row per user — user_id IS the primary key (1:1)
  @PrimaryColumn({ name: 'user_id' })
  @Index({ unique: true })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'daily_goal', type: 'int', default: 20 })
  dailyGoal!: number;

  @Column({ name: 'weekly_goal', type: 'int', default: 120 })
  weeklyGoal!: number;

  @Column({ name: 'monthly_goal', type: 'int', default: 500 })
  monthlyGoal!: number;

  @Column({ name: 'reminders_enabled', type: 'boolean', default: false })
  remindersEnabled!: boolean;

  // Local wall-clock time "HH:mm"
  @Column({ name: 'reminder_time', type: 'varchar', length: 5, default: '19:00' })
  reminderTime!: string;

  // IANA timezone, e.g. "Europe/Berlin"
  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  // Guard so the scheduler never sends two reminders in one local day
  @Column({ name: 'last_reminded_on', type: 'varchar', length: 10, nullable: true, default: null })
  lastRemindedOn!: string | null;  // local day key "YYYY-MM-DD"

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```
```typescript
// apps/api/src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSettingsEntity } from './user-settings.entity';
import { UserSettingsService } from './user-settings.service';
import { UserSettingsController } from './user-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserSettingsEntity])],
  providers: [UserSettingsService],
  controllers: [UserSettingsController],
  exports: [UserSettingsService],
})
export class SettingsModule {}
```
Register `SettingsModule` in `AppModule`.

### Acceptance criteria
- [ ] `user_settings` table exists with all columns; `user_id` is PK with unique index and FK `ON DELETE CASCADE`
- [ ] Column defaults match `DEFAULT_STUDY_GOALS` and `DEFAULT_REMINDER_SETTINGS`
- [ ] `SettingsModule` registered in `AppModule`; `npm run dev:api` starts cleanly
- [ ] `tsc --noEmit` passes in `apps/api/`

---

---

## LC-352 · `UserSettingsService`

**Phase:** 1 — Backend goals · **Points:** 3 · **Depends on:** LC-351

### User story
As a developer, I want a service that returns a user's settings (creating defaults on first read) and applies partial updates, and that creates a default row on registration.

### Files to create / modify
| File | Change |
|---|---|
| `apps/api/src/settings/user-settings.service.ts` | **Create** |
| `apps/api/src/auth/auth.service.ts` | Call `settings.createDefault()` in `register()` |
| `apps/api/src/auth/auth.module.ts` | Import `SettingsModule` |

### Implementation
```typescript
// apps/api/src/settings/user-settings.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import { DEFAULT_STUDY_GOALS, DEFAULT_REMINDER_SETTINGS } from '@lingua-card/shared/domain';
import { UserSettingsEntity } from './user-settings.entity';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly repo: Repository<UserSettingsEntity>,
  ) {}

  async createDefault(userId: string, timezone = 'UTC'): Promise<void> {
    const exists = await this.repo.findOneBy({ userId });
    if (exists) return;
    await this.repo.save(this.repo.create({
      userId,
      ...DEFAULT_STUDY_GOALS,
      ...DEFAULT_REMINDER_SETTINGS,
      timezone,
    }));
  }

  /** Returns settings, lazily creating defaults if the row is missing. */
  async getForUser(userId: string): Promise<UserSettings> {
    let entity = await this.repo.findOneBy({ userId });
    if (!entity) {
      await this.createDefault(userId);
      entity = await this.repo.findOneByOrFail({ userId });
    }
    return this.toModel(entity);
  }

  async update(userId: string, dto: UpdateUserSettingsDto): Promise<UserSettings> {
    await this.getForUser(userId); // ensure row exists
    // Whitelist updatable fields — never let a client write lastRemindedOn/userId
    const patch: Partial<UserSettingsEntity> = {};
    if (dto.dailyGoal !== undefined)        patch.dailyGoal = clampGoal(dto.dailyGoal);
    if (dto.weeklyGoal !== undefined)       patch.weeklyGoal = clampGoal(dto.weeklyGoal);
    if (dto.monthlyGoal !== undefined)      patch.monthlyGoal = clampGoal(dto.monthlyGoal);
    if (dto.remindersEnabled !== undefined) patch.remindersEnabled = dto.remindersEnabled;
    if (dto.reminderTime !== undefined)     patch.reminderTime = dto.reminderTime;
    if (dto.timezone !== undefined)         patch.timezone = dto.timezone;
    await this.repo.update({ userId }, patch);
    return this.getForUser(userId);
  }

  /** Scheduler helpers — internal, not exposed via the controller. */
  async findReminderCandidates(): Promise<UserSettingsEntity[]> {
    return this.repo.find({ where: { remindersEnabled: true } });
  }

  async markReminded(userId: string, localDayKey: string): Promise<void> {
    await this.repo.update({ userId }, { lastRemindedOn: localDayKey });
  }

  private toModel(e: UserSettingsEntity): UserSettings {
    return {
      userId: e.userId,
      dailyGoal: e.dailyGoal,
      weeklyGoal: e.weeklyGoal,
      monthlyGoal: e.monthlyGoal,
      remindersEnabled: e.remindersEnabled,
      reminderTime: e.reminderTime,
      timezone: e.timezone,
    };
  }
}

function clampGoal(v: number): number {
  return Math.max(1, Math.min(1000, Math.round(v)));
}
```
```typescript
// apps/api/src/auth/auth.service.ts — in register(), after subscriptions.createFree()
await this.settings.createDefault(saved.id);
// Inject: private readonly settings: UserSettingsService — and import SettingsModule in AuthModule
```

### Acceptance criteria
- [ ] `getForUser()` returns defaults for a user with no row (and persists them)
- [ ] `update()` whitelists fields; `userId` and `lastRemindedOn` can never be set by `dto`
- [ ] Goals are clamped to 1–1000
- [ ] Registering a new user creates a `user_settings` row with defaults
- [ ] `tsc --noEmit` passes in `apps/api/`

---

---

## LC-353 · `UserSettingsController`

**Phase:** 1 — Backend goals · **Points:** 2 · **Depends on:** LC-352

### User story
As the mobile app, I want REST endpoints to read and update the current user's settings.

### Files to create
| File | Purpose |
|---|---|
| `apps/api/src/settings/user-settings.controller.ts` | REST endpoints |

### Implementation
```typescript
// apps/api/src/settings/user-settings.controller.ts
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';

@Controller('settings')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get('me')
  getMine(@CurrentUser() user: RequestUser): Promise<UserSettings> {
    return this.settings.getForUser(user.userId);
  }

  @Patch('me')
  updateMine(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    return this.settings.update(user.userId, dto);
  }
}
```

### Acceptance criteria
- [ ] `GET /api/v1/settings/me` returns `UserSettings` for the authed user (defaults if new)
- [ ] `PATCH /api/v1/settings/me` with `{ dailyGoal: 30 }` updates only that field and returns the full row
- [ ] 401 without a JWT (global guard)
- [ ] `tsc --noEmit` passes in `apps/api/`

---

---

## LC-354 · `StatsService.computeStreak()` — goal-based daily streak

**Phase:** 2 — Backend streak · **Points:** 5 · **Depends on:** LC-352

### User story
As a user, I want my streak to count the consecutive days I hit my daily review goal (in my own timezone), so it behaves like Duolingo.

### Files to create
| File | Purpose |
|---|---|
| `apps/api/src/stats/stats.service.ts` | Streak + goal-progress computation |
| `apps/api/src/stats/stats.module.ts` | Module (imports `SettingsModule`, `ReviewModule`) |

### Computation rules (ADR-1, ADR-6)
- Bucket each session's `completedAt` into a **local day key** using the user's `timezone`.
- "Cards reviewed that day" = count of **distinct card IDs** across that day's sessions (use `Object.keys(ratings)` per session, unioned).
- A day **meets goal** if `distinctCards >= dailyGoal`.
- `current` streak = walk back from today: if today meets goal start counting at 0-offset; else if yesterday meets goal start at 1-offset (at-risk); else broken. Count consecutive goal-met days.
- `state`: `safe` if today meets goal; `at_risk` if today not met but yesterday met; `broken` otherwise (current = 0).

### Implementation
```typescript
// apps/api/src/stats/stats.service.ts
import { Injectable } from '@nestjs/common';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';
import { ReviewSessionsService } from '../review/review-sessions.service';
import { UserSettingsService } from '../settings/user-settings.service';

@Injectable()
export class StatsService {
  constructor(
    private readonly sessions: ReviewSessionsService,
    private readonly settings: UserSettingsService,
  ) {}

  /** Local day key "YYYY-MM-DD" for an ISO instant in a given IANA timezone. */
  private localDayKey(iso: string, timezone: string): string {
    // en-CA gives YYYY-MM-DD; timeZone shifts to the user's local calendar day
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  }

  private todayKey(timezone: string): string {
    return this.localDayKey(new Date().toISOString(), timezone);
  }

  private addDays(dayKey: string, delta: number): string {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  /** Map of local-day-key → set of distinct card IDs reviewed that day. */
  private async dailyCardCounts(userId: string, timezone: string): Promise<Map<string, number>> {
    const sessions = await this.sessions.findRecent(userId, 500);
    const byDay = new Map<string, Set<string>>();
    for (const s of sessions) {
      if (!s.completedAt) continue;
      const key = this.localDayKey(s.completedAt, timezone);
      const set = byDay.get(key) ?? new Set<string>();
      for (const cardId of Object.keys(s.ratings ?? {})) set.add(cardId);
      byDay.set(key, set);
    }
    return new Map([...byDay].map(([k, set]) => [k, set.size]));
  }

  async computeStreak(userId: string): Promise<StreakStatus> {
    const { dailyGoal, timezone } = await this.settings.getForUser(userId);
    const counts = await this.dailyCardCounts(userId, timezone);
    const metGoal = (key: string) => (counts.get(key) ?? 0) >= dailyGoal;

    const today = this.todayKey(timezone);
    const yesterday = this.addDays(today, -1);

    let state: StreakStatus['state'];
    let cursor: string;
    if (metGoal(today)) { state = 'safe'; cursor = today; }
    else if (metGoal(yesterday)) { state = 'at_risk'; cursor = yesterday; }
    else return { current: 0, longest: this.longest(counts, dailyGoal), state: 'broken', lastGoalMetDate: this.lastMet(counts, dailyGoal) };

    let current = 0;
    while (metGoal(cursor)) { current++; cursor = this.addDays(cursor, -1); }

    return {
      current,
      longest: Math.max(current, this.longest(counts, dailyGoal)),
      state,
      lastGoalMetDate: this.lastMet(counts, dailyGoal),
    };
  }

  private longest(counts: Map<string, number>, goal: number): number {
    const days = [...counts.keys()].filter(k => (counts.get(k) ?? 0) >= goal).sort();
    let best = 0, run = 0, prev: string | null = null;
    for (const day of days) {
      run = (prev && this.addDays(prev, 1) === day) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = day;
    }
    return best;
  }

  private lastMet(counts: Map<string, number>, goal: number): string | null {
    const met = [...counts.keys()].filter(k => (counts.get(k) ?? 0) >= goal).sort();
    return met.length ? met[met.length - 1] : null;
  }

  async computeGoalProgress(userId: string, period: GoalProgress['period']): Promise<GoalProgress> {
    const s = await this.settings.getForUser(userId);
    const counts = await this.dailyCardCounts(userId, s.timezone);
    const today = this.todayKey(s.timezone);

    const inWindow = (key: string): boolean => {
      if (period === 'daily') return key === today;
      const days = period === 'weekly' ? 7 : 30;
      let cur = today;
      for (let i = 0; i < days; i++) { if (key === cur) return true; cur = this.addDays(cur, -1); }
      return false;
    };

    const reviewed = [...counts.entries()]
      .filter(([k]) => inWindow(k))
      .reduce((sum, [, n]) => sum + n, 0);
    const goal = period === 'daily' ? s.dailyGoal : period === 'weekly' ? s.weeklyGoal : s.monthlyGoal;
    return { period, reviewed, goal, metGoal: reviewed >= goal };
  }
}
```

### Acceptance criteria
- [ ] A day counts toward the streak only when distinct cards reviewed ≥ `dailyGoal`
- [ ] Days are bucketed in the **user's timezone** (a 23:41 local session counts on the correct local day)
- [ ] `state` is `safe` when today's goal is met, `at_risk` when yesterday met but not today, `broken` otherwise
- [ ] `longest` is the all-time best run; `current` includes today only if today met
- [ ] `computeGoalProgress` returns correct distinct-card totals for daily/weekly/monthly windows
- [ ] `tsc --noEmit` passes in `apps/api/`

---

---

## LC-355 · `StatsController`

**Phase:** 2 — Backend streak · **Points:** 2 · **Depends on:** LC-354

### Files to create
| File | Purpose |
|---|---|
| `apps/api/src/stats/stats.controller.ts` | REST endpoints |

### Implementation
```typescript
// apps/api/src/stats/stats.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import type { StreakStatus, GoalProgress } from '@lingua-card/shared/domain';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('streak')
  streak(@CurrentUser() user: RequestUser): Promise<StreakStatus> {
    return this.stats.computeStreak(user.userId);
  }

  @Get('goal-progress')
  goalProgress(
    @CurrentUser() user: RequestUser,
    @Query('period') period: GoalProgress['period'] = 'daily',
  ): Promise<GoalProgress> {
    return this.stats.computeGoalProgress(user.userId, period);
  }
}
```

### Acceptance criteria
- [ ] `GET /api/v1/stats/streak` returns a `StreakStatus`
- [ ] `GET /api/v1/stats/goal-progress?period=weekly` returns weekly `GoalProgress`; defaults to `daily`
- [ ] 401 without JWT
- [ ] `tsc --noEmit` passes in `apps/api/`

---

---

## LC-356 · VAPID keys + `web-push` config

**Phase:** 3 — Backend push · **Points:** 1 · **Depends on:** nothing

### User story
As a developer, I want a VAPID keypair and `web-push` wired into config so the server can send push messages.

### Steps
```bash
cd apps/api
npm install web-push
npx web-push generate-vapid-keys   # prints publicKey + privateKey
```
Add to `.env` and `.env.example`:
```
VAPID_PUBLIC_KEY=BB...   # safe to ship to clients
VAPID_PRIVATE_KEY=...    # secret — never expose
VAPID_SUBJECT=mailto:kennethnnalue.dev@gmail.com
```
Add to `render.yaml` env group. Surface in an `AppConfig`/`PushConfig` provider following the existing config pattern (see how `AiConfig` is structured).

### Acceptance criteria
- [ ] `web-push` installed in `apps/api`
- [ ] VAPID keys generated; public/private/subject in `.env` and `.env.example` (private key documented as secret)
- [ ] A `PushConfig` provider exposes the three values
- [ ] `tsc --noEmit` passes

---

---

## LC-357 · `PushSubscriptionEntity` + `PushService`

**Phase:** 3 — Backend push · **Points:** 2 · **Depends on:** LC-356

### Files to create
| File | Purpose |
|---|---|
| `apps/api/src/push/push-subscription.entity.ts` | TypeORM entity (one user → many devices) |
| `apps/api/src/push/push.service.ts` | Store/prune subscriptions, send push |
| `apps/api/src/push/push.module.ts` | Module |

### Implementation
```typescript
// apps/api/src/push/push-subscription.entity.ts
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { UserEntity } from '../auth/user.entity';

@Entity('push_subscriptions')
export class PushSubscriptionEntity {
  // endpoint is globally unique per browser/device — use it as PK
  @PrimaryColumn({ type: 'text' })
  endpoint!: string;

  @Index()
  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 255 })
  p256dh!: string;

  @Column({ type: 'varchar', length: 255 })
  auth!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```
```typescript
// apps/api/src/push/push.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import type { PushSubscriptionDto } from '@lingua-card/shared/domain';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushConfig } from './push.config';

export interface PushPayload { title: string; body: string; url?: string; }

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly repo: Repository<PushSubscriptionEntity>,
    private readonly config: PushConfig,
  ) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }

  async subscribe(userId: string, sub: PushSubscriptionDto): Promise<void> {
    await this.repo.save(this.repo.create({
      endpoint: sub.endpoint, userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    }));
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repo.delete({ endpoint });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const subs = await this.repo.find({ where: { userId } });
    await Promise.all(subs.map(s => this.sendOne(s, payload)));
  }

  private async sendOne(s: PushSubscriptionEntity, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
    } catch (err: any) {
      // 404/410 = subscription expired → prune it
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await this.unsubscribe(s.endpoint);
        this.logger.log(`Pruned expired subscription ${s.endpoint.slice(0, 32)}…`);
      } else {
        this.logger.warn(`Push send failed: ${err?.message}`);
      }
    }
  }
}
```

### Acceptance criteria
- [ ] `push_subscriptions` table with `endpoint` PK, `user_id` FK `ON DELETE CASCADE`, indexed `user_id`
- [ ] `subscribe()` is idempotent (re-subscribing the same endpoint overwrites, no duplicate row)
- [ ] `sendToUser()` sends to all of a user's devices; a `410`/`404` prunes that subscription
- [ ] `tsc --noEmit` passes

---

---

## LC-358 · `PushController`

**Phase:** 3 — Backend push · **Points:** 2 · **Depends on:** LC-357

### Implementation
```typescript
// apps/api/src/push/push.controller.ts
import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { PushService } from './push.service';
import { PushConfig } from './push.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import type { PushSubscriptionDto } from '@lingua-card/shared/domain';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService, private readonly config: PushConfig) {}

  @Get('vapid-public-key')
  publicKey(): { publicKey: string } {
    return { publicKey: this.config.publicKey };
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: RequestUser, @Body() sub: PushSubscriptionDto): Promise<void> {
    return this.push.subscribe(user.userId, sub);
  }

  @Delete('unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }): Promise<void> {
    return this.push.unsubscribe(body.endpoint);
  }
}
```

### Acceptance criteria
- [ ] `GET /api/v1/push/vapid-public-key` returns the public key (no auth strictly required, but fine behind the guard)
- [ ] `POST /api/v1/push/subscribe` stores the subscription against the authed user
- [ ] `DELETE /api/v1/push/unsubscribe` removes by endpoint
- [ ] `tsc --noEmit` passes

---

---

## LC-359 · `ReminderSchedulerService` — hourly goal-gated cron

**Phase:** 3 — Backend push · **Points:** 5 · **Depends on:** LC-354, LC-357, LC-352

### User story
As a user, I want a reminder at my chosen time only if I haven't hit my daily goal, so I'm nudged exactly when it helps and never nagged after I'm done.

### Files to create / modify
| File | Change |
|---|---|
| `apps/api/src/push/reminder-scheduler.service.ts` | **Create** |
| `apps/api/src/app.module.ts` | `ScheduleModule.forRoot()` |

### Implementation
```typescript
// apps/api/src/push/reminder-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserSettingsService } from '../settings/user-settings.service';
import { StatsService } from '../stats/stats.service';
import { PushService } from './push.service';

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly settings: UserSettingsService,
    private readonly stats: StatsService,
    private readonly push: PushService,
  ) {}

  // Top of every hour
  @Cron('0 * * * *')
  async sendDueReminders(): Promise<void> {
    const candidates = await this.settings.findReminderCandidates();
    const now = new Date();

    for (const s of candidates) {
      const localHour = this.hourInTz(now, s.timezone);
      const [reminderHour] = s.reminderTime.split(':').map(Number);
      if (localHour !== reminderHour) continue;

      const todayKey = this.dayKeyInTz(now, s.timezone);
      if (s.lastRemindedOn === todayKey) continue; // already reminded today

      const streak = await this.stats.computeStreak(s.userId);
      const progress = await this.stats.computeGoalProgress(s.userId, 'daily');
      if (progress.metGoal) continue; // goal already hit — don't nag

      const remaining = Math.max(0, progress.goal - progress.reviewed);
      const body = streak.current > 0
        ? `Keep your ${streak.current}-day streak alive — ${remaining} cards to go!`
        : `${remaining} cards left to hit today's goal. Let's go!`;

      await this.push.sendToUser(s.userId, { title: 'Time to review 📚', body, url: '/review' });
      await this.settings.markReminded(s.userId, todayKey);
    }
  }

  private hourInTz(date: Date, tz: string): number {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date));
  }
  private dayKeyInTz(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}
```
Add `ScheduleModule.forRoot()` to `AppModule` imports; provide `ReminderSchedulerService` in `PushModule` (which must import `SettingsModule` and `StatsModule`).

### Acceptance criteria
- [ ] Cron runs hourly; only users whose local hour matches `reminderTime` are considered
- [ ] A user who already met today's daily goal is **never** sent a reminder
- [ ] `lastRemindedOn` prevents a second reminder the same local day
- [ ] Reminder copy references the live streak count and remaining cards
- [ ] Manual test: set `reminderTime` to the current local hour, leave goal unmet, trigger the cron method directly → push received; meet the goal → no push
- [ ] `tsc --noEmit` passes

---

---

## LC-360 · `SettingsStore` + `SettingsApiService`

**Phase:** 4 — Mobile settings · **Points:** 3 · **Depends on:** LC-353

### User story
As the app, I want a `signalStore` holding the user's settings, loaded on startup and updated optimistically, so goals and reminder prefs are available everywhere.

### Files to create
| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/settings/services/settings-api.service.ts` | HTTP |
| `apps/mobile/src/app/features/settings/store/settings.store.ts` | `signalStore` |

### Implementation
```typescript
// settings-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/settings`;

  get(): Observable<UserSettings> { return this.http.get<UserSettings>(`${this.base}/me`); }
  update(dto: UpdateUserSettingsDto): Observable<UserSettings> {
    return this.http.patch<UserSettings>(`${this.base}/me`, dto);
  }
}
```
```typescript
// settings.store.ts
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';
import { DEFAULT_STUDY_GOALS, DEFAULT_REMINDER_SETTINGS } from '@lingua-card/shared/domain';
import { SettingsApiService } from '../services/settings-api.service';

interface SettingsState { settings: UserSettings | null; loaded: boolean; }
const initial: SettingsState = { settings: null, loaded: false };

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods(store => {
    const api = inject(SettingsApiService);
    return {
      async load(): Promise<void> {
        try {
          const settings = await firstValueFrom(api.get());
          patchState(store, { settings, loaded: true });
        } catch {
          patchState(store, { loaded: true }); // offline: keep null, UI shows defaults
        }
      },
      async update(dto: UpdateUserSettingsDto): Promise<void> {
        const current = store.settings();
        if (current) patchState(store, { settings: { ...current, ...dto } }); // optimistic
        try {
          const saved = await firstValueFrom(api.update(dto));
          patchState(store, { settings: saved });
        } catch { /* offline: optimistic value stands; SyncService can retry later */ }
      },
    };
  }),
);
```
Call `SettingsStore.load()` at app bootstrap (alongside the other store loads). Pass the device timezone on first load via `update({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })` if the server still has the default `UTC`.

### Acceptance criteria
- [ ] `SettingsStore.load()` populates settings on startup; offline failure leaves `loaded: true` with `settings: null` (UI falls back to `DEFAULT_STUDY_GOALS`)
- [ ] `update()` is optimistic and reconciles with the server response
- [ ] Device timezone is sent to the server when it is still `UTC`
- [ ] `tsc --noEmit` passes in `apps/mobile/`

---

---

## LC-361 · Study-goals settings UI

**Phase:** 4 — Mobile settings · **Points:** 3 · **Depends on:** LC-360

### User story
As a learner, I want to set my daily, weekly, and monthly review targets (with sensible defaults pre-filled), so the streak and progress reflect my own ambition.

### Files to create
| File | Purpose |
|---|---|
| `apps/mobile/src/app/features/settings/pages/study-goals/study-goals.page.ts` | Page |
| `.../study-goals.page.html` / `.scss` | Template + styles (LDS tokens) |

### UI spec (see design reference, screen "Study goals")
- Three goal rows: Daily / Weekly / Monthly. Each row has a label, a description ("Cards reviewed per day to keep your streak"), and a stepper (− value +) plus quick-pick chips (e.g. Daily: 10 / 20 / 30 / 50).
- A note under Daily: "Hitting this goal each day extends your streak."
- Changes save on commit (debounced) via `SettingsStore.update()`.
- Use `t.$lc-*` tokens and `u.*` mixins only — no raw CSS values. SignalStore via `inject(SettingsStore)`.

### Acceptance criteria
- [ ] Three editable goals; values initialise from `SettingsStore` (or `DEFAULT_STUDY_GOALS` when offline)
- [ ] Daily quick-pick chips set common values in one tap
- [ ] Editing a goal persists via `SettingsStore.update()` and survives app restart
- [ ] All SCSS uses LDS tokens/mixins; OnPush; standalone; lazy-loaded route
- [ ] `tsc --noEmit` passes

---

---

## LC-362 · `ReviewStatsStore`: goal-based streak + server reconcile

**Phase:** 5 — Mobile streak · **Points:** 3 · **Depends on:** LC-355, LC-360

### User story
As a user, I want the home streak to instantly reflect a session I just finished, then settle on the server's authoritative value.

### Files to modify
| File | Change |
|---|---|
| `apps/mobile/src/app/shared/srs/review-stats.store.ts` | Replace activity-based `dayStreak` with goal-based + server reconcile |

### Implementation notes
- Add a `streakStatus` signal hydrated from `GET /stats/streak` (via a new `StatsApiService`), refreshed on app load and after each `completeSession`.
- Keep an **optimistic** local `dayStreak` computed the new way: a local day counts only if distinct cards reviewed that day ≥ `SettingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal`.
- Expose `streak = computed(() => serverStreak() ?? optimisticStreak())` so the UI prefers the server value but never shows stale-empty on cold load.

```typescript
// review-stats.store.ts (additions)
const settingsStore = inject(SettingsStore);
const statsApi = inject(StatsApiService);

const dailyGoal = computed(() => settingsStore.settings()?.dailyGoal ?? DEFAULT_STUDY_GOALS.dailyGoal);

// distinct cards per local day already available via sessionCardIds + localDayKey
const optimisticStreak = computed<StreakStatus>(() => {
  // ...walk back local days where distinctCards(day) >= dailyGoal()
  // produce { current, longest, state, lastGoalMetDate }
});

const serverStreak = signal<StreakStatus | null>(null);
async function refreshStreak() {
  try { serverStreak.set(await firstValueFrom(statsApi.streak())); } catch { /* keep optimistic */ }
}

const streak = computed(() => serverStreak() ?? optimisticStreak());
```

### Acceptance criteria
- [ ] `dayStreak` now counts only days where distinct cards ≥ `dailyGoal`
- [ ] Completing a session that crosses the daily goal flips `state` to `safe` and increments `current` optimistically
- [ ] On load and after session complete, the store fetches `GET /stats/streak` and prefers it
- [ ] When offline, the optimistic value is shown; no empty flash on cold launch
- [ ] `tsc --noEmit` passes

---

---

## LC-363 · Home redesign: streak ring + daily goal progress + at-risk

**Phase:** 5 — Mobile streak · **Points:** 3 · **Depends on:** LC-362

### User story
As a user, I want the home screen to foreground my daily streak and today's goal progress, with a clear "keep your streak" prompt when I haven't reviewed yet, so the daily habit is obvious.

### Files to modify
| File | Change |
|---|---|
| `features/home/pages/home/home.page.html` | Replace 7-dot streak stat with a streak ring + daily-goal ring; reframe "This week" as secondary |
| `features/home/pages/home/home.page.ts` | Bind `streak`, `dailyProgress` from stores |
| `features/home/pages/home/home.page.scss` | New `.streak-ring`, `.goal-ring`, `.streak-atrisk` styles (LDS tokens) |

### UI spec (see design reference, "Home — streak")
- **Streak hero stat:** a flame + the current streak number, large. Below it, the `state`:
  - `safe`: "On track today ✓"
  - `at_risk`: amber "Review now to keep your N-day streak" with a Start CTA
  - `broken`: neutral "Start a new streak today"
- **Daily goal ring:** circular progress = `reviewed / dailyGoal` (e.g. 12/20). Caps at 100%; turns brand-green and shows a check when met.
- Keep "This week" chart, but it is now clearly the *weekly goal* progress (`weeklyTotal / weeklyGoal`), not the streak. Replace the hardcoded `Goal: 150` with `weeklyGoal` from settings.

### Acceptance criteria
- [ ] Home shows current streak with flame and `state`-specific messaging
- [ ] `at_risk` shows an amber prompt + Start session CTA
- [ ] Daily goal ring shows `reviewed/dailyGoal`, fills to green + check at 100%
- [ ] "This week" goal label reads from `weeklyGoal` (no hardcoded 150)
- [ ] All SCSS uses LDS tokens; OnPush
- [ ] `tsc --noEmit` passes

---

---

## LC-364 · Streak milestone celebration modal

**Phase:** 5 — Mobile streak · **Points:** 2 · **Depends on:** LC-363

### User story
As a user, I want a small celebration when I reach a streak milestone (3, 7, 14, 30, 50, 100, 365), so hitting goals feels rewarding.

### Files to create
| File | Purpose |
|---|---|
| `features/home/components/streak-milestone/streak-milestone.component.ts` | Modal/sheet |

### Implementation notes
- Trigger when `streak.current` crosses a milestone *and* it wasn't already celebrated (persist `lastCelebratedMilestone` in `localData`/Preferences to avoid re-showing).
- Content: flame icon, "N day streak!", a short encouragement, single "Keep going" dismiss button.
- Respect `prefers-reduced-motion` for any confetti/animation.

### Acceptance criteria
- [ ] Modal appears once when a milestone is first reached (3/7/14/30/50/100/365)
- [ ] Never re-shows for the same milestone (persisted)
- [ ] Reduced-motion users get a static version
- [ ] LDS tokens; OnPush
- [ ] `tsc --noEmit` passes

---

---

## LC-365 · Register Angular service worker + push handling

**Phase:** 6 — Mobile push · **Points:** 2 · **Depends on:** nothing (parallel)

### User story
As a developer, I want the Angular service worker enabled so the app can receive push messages and show notifications when closed.

### Steps / files
```bash
cd apps/mobile
ng add @angular/pwa   # if not already present — creates ngsw-config.json, registers SW
```
In `app.config.ts` (or `main.ts` providers):
```typescript
import { provideServiceWorker } from '@angular/service-worker';
import { isDevMode } from '@angular/core';

provideServiceWorker('ngsw-worker.js', {
  enabled: !isDevMode(),
  registrationStrategy: 'registerWhenStable:30000',
}),
```
`ngsw-worker.js` handles the `push` and `notificationclick` events natively — pushes that include a `notification` payload are shown automatically. Ensure the payload sent in LC-359 maps to ngsw's expected shape (use the `{ notification: { title, body, data: { url } } }` form if you switch from raw `showNotification`). Keep `manifest.webmanifest` linked in `index.html`.

### Acceptance criteria
- [ ] Service worker registers in production builds (not dev)
- [ ] A test push (via DevTools / `web-push` CLI) shows a system notification with the app icon while the tab is closed
- [ ] Clicking the notification focuses/opens the app at the `url` from the payload
- [ ] `manifest.webmanifest` still loads; PWA install still works
- [ ] `tsc --noEmit` passes

---

---

## LC-366 · `PushService` (permission, subscribe, sync)

**Phase:** 6 — Mobile push · **Points:** 3 · **Depends on:** LC-358, LC-365

### User story
As a user, I want to grant notification permission and have the app register my device for reminders.

### Files to create
| File | Purpose |
|---|---|
| `apps/mobile/src/app/core/services/push.service.ts` | Wraps `SwPush` |
| `apps/mobile/src/app/core/services/push-api.service.ts` | HTTP to `/push/*` |

### Implementation
```typescript
// push.service.ts
import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { PushApiService } from './push-api.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly api = inject(PushApiService);

  get isSupported(): boolean { return this.swPush.isEnabled; }

  /** Returns true if a subscription is now active. */
  async enable(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;
    try {
      const { publicKey } = await firstValueFrom(this.api.vapidPublicKey());
      const sub = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      await firstValueFrom(this.api.subscribe(sub.toJSON() as any));
      // Listen for click navigation
      this.swPush.notificationClicks.subscribe(({ notification }) => {
        const url = (notification as any).data?.url ?? '/review';
        window.location.assign(url);
      });
      return true;
    } catch {
      return false; // permission denied or unsupported
    }
  }

  async disable(): Promise<void> {
    const sub = await firstValueFrom(this.swPush.subscription);
    if (sub) {
      await firstValueFrom(this.api.unsubscribe(sub.endpoint));
      await sub.unsubscribe();
    }
  }
}
```

### Acceptance criteria
- [ ] `isSupported` is false on browsers without push / when SW disabled (UI hides the toggle)
- [ ] `enable()` requests permission, subscribes via `SwPush`, and POSTs the subscription to the backend
- [ ] `disable()` unsubscribes locally and DELETEs on the backend
- [ ] Permission denial is handled gracefully (returns false, no crash)
- [ ] `tsc --noEmit` passes

---

---

## LC-367 · Reminder settings UI

**Phase:** 6 — Mobile push · **Points:** 2 · **Depends on:** LC-366, LC-361

### User story
As a user, I want to turn reminders on/off and choose a reminder time, so I'm nudged when it suits me.

### Files to modify / create
| File | Change |
|---|---|
| `features/settings/pages/study-goals/study-goals.page.html` | Add a "Reminders" section (or a sibling settings page) |

### UI spec (see design reference, "Settings — reminders")
- **Enable reminders** toggle. Turning on calls `PushService.enable()`; on success, `SettingsStore.update({ remindersEnabled: true })`. On failure (permission denied), show a hint explaining browser settings and leave the toggle off.
- **Reminder time** picker (hour:minute), persisted via `SettingsStore.update({ reminderTime })`. Also send the current `timezone`.
- If `!PushService.isSupported`, hide the section and show a one-line note ("Reminders need a browser that supports notifications; mobile apps coming later").

### Acceptance criteria
- [ ] Toggle drives both browser permission/subscription and `remindersEnabled` on the server
- [ ] Denied permission leaves the toggle off with an explanatory hint
- [ ] Reminder time persists and is sent with timezone
- [ ] Section hidden on unsupported browsers
- [ ] LDS tokens; OnPush
- [ ] `tsc --noEmit` passes

---

---

## LC-368 · Update `CLAUDE.md`

**Phase:** 7 — Docs · **Points:** 1 · **Depends on:** all above

### Changes
- **Epic table:** add `| 15 | Streak, Goals & Web Reminders | ✅ Implemented | apps/api/src/{settings,stats,push}/, features/settings/, apps/mobile/epics/epic-streak-goals-reminders.md |`
- **New "Streak & goals" section** documenting: streak = goal-met days (local tz), server-authoritative via `GET /stats/streak`, goals in `user_settings`, defaults (20/120/500).
- **New "Web push" section:** VAPID env vars, `push_subscriptions` table, hourly `ReminderSchedulerService`, `SwPush` on the client, iOS-installed-PWA caveat.
- **Store-ownership table:** add `SettingsStore (settings/, providedIn root)` and note `ReviewStatsStore` now depends on `SettingsStore`.
- **Documentation map:** add `apps/mobile/epics/epic-streak-goals-reminders.md`.
- Copy this epic file into the project at that path.

### Acceptance criteria
- [ ] `CLAUDE.md` reflects streak/goals/push architecture and env vars
- [ ] Epic file copied into the repo
- [ ] Store-ownership and documentation map updated

---

## 6. Non-goals (explicitly out of scope)

- **Native iOS/Android push** (Capacitor local/remote notifications) — a later epic. Web Push on iOS works only for installed PWAs (iOS 16.4+); documented, not engineered around.
- **Purchasable streak freezes / streak repair** — we keep a single forgiving "rest day" grace (ADR-6), no freeze economy.
- **Leaderboards / social streaks / friend streaks.**
- **Gamified XP, leagues, gems** — out of scope; this epic is streak + goals + reminders only.
- **Per-card reminder scheduling** (e.g. "your card X is due") — reminders are goal-based, not card-based.
- **Multiple reminders per day** — one reminder/day at the chosen time.
- **Email reminders** — push only (an email fallback could reuse the existing Nodemailer setup in a future ticket).
- **Backfilling streak history** — streak recomputes from existing `reviewSessions`; we don't retroactively credit pre-goal days differently.

---

## 7. Definition of done (epic-level)

- [ ] The streak counts consecutive **goal-met** days in the user's timezone, is identical on cold launch across devices/reinstall, and survives offline (optimistic) then reconciles with the server.
- [ ] Daily/weekly/monthly goals are editable, persisted, and drive both the streak (daily) and the home progress rings.
- [ ] Web push reminders fire when the app is closed, only when the daily goal is unmet, at most once per local day, at the user's chosen time.
- [ ] No hardcoded `Goal: 150` remains on home.
- [ ] `tsc --noEmit` green for `apps/api` and `apps/mobile`.
- [ ] `CLAUDE.md` updated (epic table, streak/goals/push sections, store-ownership, docs map).
- [ ] Every ticket followed `.claude/skills/angular.md` (OnPush, standalone, `input()`/`inject()`, `signalStore`, lazy-loaded, no `any`, DTOs for writes, no hardcoded URLs/languages) and `.claude/skills/lds.md` for UI.
