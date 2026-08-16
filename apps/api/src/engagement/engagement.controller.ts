import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EngagementDashboardService, ServerEngagementDashboard } from './engagement-dashboard.service';

@Controller('engagement')
export class EngagementController {
  constructor(private readonly engagement: EngagementDashboardService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() userId: string): Promise<ServerEngagementDashboard> {
    return this.engagement.dashboard(userId);
  }
}
