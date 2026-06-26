import {
  Controller, Post, Get, Delete, Patch, Body, Param,
} from '@nestjs/common';
import { CreateShareDto, RespondToShareDto } from '@lingua-card/shared/dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SharesService } from './shares.service';
import { ShareSyncService } from './share-sync.service';

@Controller('shares')
export class SharesController {
  constructor(
    private readonly sharesService: SharesService,
    private readonly syncService: ShareSyncService,
  ) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateShareDto) {
    return this.sharesService.create(userId, dto);
  }

  @Get('pending')
  findPending(@CurrentUser() userId: string) {
    return this.sharesService.findPending(userId);
  }

  @Get('pending/count')
  async pendingCount(@CurrentUser() userId: string) {
    const count = await this.sharesService.pendingCount(userId);
    return { count };
  }

  @Post(':id/respond')
  respond(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: RespondToShareDto,
  ) {
    return this.sharesService.respond(userId, id, dto.accept);
  }

  @Get('sent')
  findSent(@CurrentUser() userId: string) {
    return this.sharesService.findSent(userId);
  }

  @Delete(':id')
  cancel(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.sharesService.cancel(userId, id);
  }

  @Get('sync-links/:resourceId/status')
  async syncStatus(
    @CurrentUser() userId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const link = await this.syncService.findActiveLinkByTarget(resourceId, userId);
    return { synced: !!link };
  }

  @Patch('sync-links/:resourceId/unsync')
  async unsync(
    @CurrentUser() userId: string,
    @Param('resourceId') resourceId: string,
  ) {
    const link = await this.syncService.findActiveLinkByTarget(resourceId, userId);
    if (link) await this.syncService.deactivateLink(link.id);
    return { unsynced: !!link };
  }
}
