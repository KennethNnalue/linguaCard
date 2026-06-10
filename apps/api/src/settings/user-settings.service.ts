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
    await this.getForUser(userId);
    const patch: Partial<UserSettingsEntity> = {};
    const goalTouched = dto.dailyGoal !== undefined || dto.weeklyGoal !== undefined || dto.monthlyGoal !== undefined;
    if (dto.dailyGoal !== undefined)        patch.dailyGoal = clampGoal(dto.dailyGoal);
    if (dto.weeklyGoal !== undefined)       patch.weeklyGoal = clampGoal(dto.weeklyGoal);
    if (dto.monthlyGoal !== undefined)      patch.monthlyGoal = clampGoal(dto.monthlyGoal);
    if (goalTouched)                        patch.goalsSetAt = new Date();
    if (dto.remindersEnabled !== undefined) patch.remindersEnabled = dto.remindersEnabled;
    if (dto.reminderTime !== undefined)     patch.reminderTime = dto.reminderTime;
    if (dto.timezone !== undefined)         patch.timezone = dto.timezone;
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
    };
  }
}

function clampGoal(v: number): number {
  return Math.max(1, Math.min(1000, Math.round(v)));
}
