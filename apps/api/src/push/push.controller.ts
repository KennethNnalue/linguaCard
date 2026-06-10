import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { PushService } from './push.service';
import { PushConfig } from './push.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { PushSubscriptionDto } from '@lingua-card/shared/domain';

@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly config: PushConfig,
  ) {}

  @Get('vapid-public-key')
  publicKey(): { publicKey: string } {
    return { publicKey: this.config.publicKey };
  }

  @Post('subscribe')
  subscribe(@CurrentUser() userId: string, @Body() sub: PushSubscriptionDto): Promise<void> {
    return this.push.subscribe(userId, sub);
  }

  @Delete('unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }): Promise<void> {
    return this.push.unsubscribe(body.endpoint);
  }
}
