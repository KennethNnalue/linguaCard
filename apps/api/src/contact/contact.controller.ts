import { Controller, Post, Body } from '@nestjs/common';
import { ContactService } from './contact.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UpgradeRequestDto } from '@lingua-card/shared/domain';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post('upgrade')
  async requestUpgrade(
    @Body() dto: UpgradeRequestDto,
    @CurrentUser() userId?: string,
  ): Promise<{ ok: boolean }> {
    await this.contactService.sendUpgradeRequest(dto, userId);
    return { ok: true };
  }
}
