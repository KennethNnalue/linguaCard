import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto, UpdateCollectionDto } from '@lingua-card/shared/dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  findAll(@CurrentUser() userId: string) {
    return this.collectionsService.findAll(userId);
  }

  @Get(':id')
  findOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.collectionsService.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionsService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.collectionsService.remove(userId, id);
  }

  @Post(':id/cards/:cardId')
  addExistingCard(
    @CurrentUser() userId: string,
    @Param('id') collectionId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.collectionsService.addExistingCard(userId, collectionId, cardId);
  }
}
