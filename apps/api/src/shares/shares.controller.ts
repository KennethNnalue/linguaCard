import {
  Controller, Post, Get, Delete, Patch, Body, Param, Req,
} from '@nestjs/common';
import type { CreateShareDto, RespondToShareDto } from '@lingua-card/shared/domain';
import { SharesService } from './shares.service';
import { ShareSyncService } from './share-sync.service';

@Controller('shares')
export class SharesController {
  constructor(
    private readonly sharesService: SharesService,
    private readonly syncService: ShareSyncService,
  ) {}

  @Post()
  create(@Req() req: { user: { sub: string } }, @Body() dto: CreateShareDto) {
    return this.sharesService.create(req.user.sub, dto);
  }

  @Get('pending')
  findPending(@Req() req: { user: { sub: string } }) {
    return this.sharesService.findPending(req.user.sub);
  }

  @Get('pending/count')
  async pendingCount(@Req() req: { user: { sub: string } }) {
    const count = await this.sharesService.pendingCount(req.user.sub);
    return { count };
  }

  @Post(':id/respond')
  respond(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: RespondToShareDto,
  ) {
    return this.sharesService.respond(req.user.sub, id, dto.accept);
  }

  @Get('sent')
  findSent(@Req() req: { user: { sub: string } }) {
    return this.sharesService.findSent(req.user.sub);
  }

  @Delete(':id')
  cancel(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.sharesService.cancel(req.user.sub, id);
  }

  @Get('sync-links/:resourceId/status')
  async syncStatus(
    @Req() req: { user: { sub: string } },
    @Param('resourceId') resourceId: string,
  ) {
    const link = await this.syncService.findActiveLinkByTarget(resourceId, req.user.sub);
    return { synced: !!link };
  }

  @Patch('sync-links/:resourceId/unsync')
  async unsync(
    @Req() req: { user: { sub: string } },
    @Param('resourceId') resourceId: string,
  ) {
    const link = await this.syncService.findActiveLinkByTarget(resourceId, req.user.sub);
    if (link) await this.syncService.deactivateLink(link.id);
    return { unsynced: !!link };
  }
}
