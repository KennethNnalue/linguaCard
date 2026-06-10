import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserSettings, UpdateUserSettingsDto } from '@lingua-card/shared/domain';

@Controller('settings')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get('me')
  getMine(@CurrentUser() userId: string): Promise<UserSettings> {
    return this.settings.getForUser(userId);
  }

  @Patch('me')
  updateMine(
    @CurrentUser() userId: string,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    return this.settings.update(userId, dto);
  }
}
