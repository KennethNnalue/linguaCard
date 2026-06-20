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

  async getForUser(userId: string): Promise<UserSettings> {
    let entity = await this.repo.findOneBy({ userId });
    if (!entity) {
      await this.createDefault(userId);
      entity = await this.repo.findOneByOrFail({ userId });
    }
    return this.toModel(entity);
  }

  async update(userId: string, dto: UpdateUserSettingsDto): Promise<UserSettings> {
    await this.getForUser(userId); // ensure a row exists
    const entity = await this.repo.findOneByOrFail({ userId });

    // Edit time on the originating device. Legacy clients that don't send a
    // timestamp fall back to server receive-time (preserves old behaviour).
    const editedAt = dto.clientUpdatedAt ?? new Date().toISOString();
    const stamps: Record<string, string> = { ...(entity.fieldTimestamps ?? {}) };

    // A field is only overwritten when this edit is at least as recent as the
    // last recorded change to that field — this is what stops a stale offline
    // edit from clobbering a newer edit made on another device.
    const isNewer = (field: string): boolean => {
      const prev = stamps[field];
      return !prev || editedAt >= prev;
    };
    const stamp = (field: string): void => {
      stamps[field] = editedAt;
    };

    const patch: Partial<UserSettingsEntity> = {};
    let goalApplied = false;

    if (dto.dailyGoal !== undefined && isNewer('dailyGoal'))             { patch.dailyGoal = clampGoal(dto.dailyGoal, 500); stamp('dailyGoal'); goalApplied = true; }
    if (dto.weeklyGoal !== undefined && isNewer('weeklyGoal'))          { patch.weeklyGoal = clampGoal(dto.weeklyGoal, 2000); stamp('weeklyGoal'); goalApplied = true; }
    if (dto.monthlyGoal !== undefined && isNewer('monthlyGoal'))        { patch.monthlyGoal = clampGoal(dto.monthlyGoal, 5000); stamp('monthlyGoal'); goalApplied = true; }
    if (dto.remindersEnabled !== undefined && isNewer('remindersEnabled')) { patch.remindersEnabled = dto.remindersEnabled; stamp('remindersEnabled'); }
    if (dto.reminderTime !== undefined && isNewer('reminderTime'))      { patch.reminderTime = dto.reminderTime; stamp('reminderTime'); }
    if (dto.timezone !== undefined && isNewer('timezone'))              { patch.timezone = dto.timezone; stamp('timezone'); }
    if (dto.uiLanguage !== undefined && isNewer('uiLanguage'))          { patch.uiLanguage = dto.uiLanguage; stamp('uiLanguage'); }

    // Onboarding fields (no last-write-wins — these only move forward)
    if (dto.onboardingStep !== undefined)  { patch.onboardingStep = dto.onboardingStep; }
    if (dto.motivation !== undefined)      { patch.motivation = dto.motivation; }
    if (dto.level !== undefined)           { patch.level = dto.level; }
    if (dto.completeOnboarding)            { patch.onboardingCompletedAt = new Date(editedAt); }

    // goalsSetAt drives the "set your goals" prompt — stamp it with the edit
    // time only when a goal field was actually (re)applied.
    if (goalApplied) patch.goalsSetAt = new Date(editedAt);

    patch.fieldTimestamps = stamps;
    await this.repo.update({ userId }, patch);
    return this.getForUser(userId);
  }

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
      goalsSetAt: e.goalsSetAt ? e.goalsSetAt.toISOString() : null,
      uiLanguage: (e.uiLanguage ?? 'en') as UserSettings['uiLanguage'],
      onboardingCompletedAt: e.onboardingCompletedAt ? e.onboardingCompletedAt.toISOString() : null,
      onboardingStep: e.onboardingStep,
      motivation: e.motivation as UserSettings['motivation'],
      level: e.level as UserSettings['level'],
    };
  }
}

function clampGoal(v: number, max = 5000): number {
  return Math.max(1, Math.min(max, Math.round(v)));
}
