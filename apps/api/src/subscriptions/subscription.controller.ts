import { Controller, Get } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SubscriptionStatus } from '@lingua-card/shared/domain';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  getMySubscription(@CurrentUser() userId: string): Promise<SubscriptionStatus> {
    return this.subscriptionService.getStatusForUser(userId);
  }
}
