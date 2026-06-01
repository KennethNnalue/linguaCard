import { Controller, Get, Post, Patch, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common';
import { CardsService, PendingSrsRating } from './cards.service';
import { WordDedupService } from './word-dedup.service';
import { CreateCardDto, UpdateCardDto, CheckDuplicatesDto } from '@lingua-card/shared/dto';
import type { CardQueryParams } from '@lingua-card/shared/dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('cards')
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly wordDedupService: WordDedupService,
  ) {}

  @Get()
  findAll(@CurrentUser() userId: string, @Query() query: CardQueryParams) {
    return this.cardsService.findAll(userId, query);
  }

  // Must be before @Get(':id') so static paths are not treated as card ids
  @Post('srs/batch')
  batchRateSrs(@CurrentUser() userId: string, @Body() ratings: PendingSrsRating[]) {
    return this.cardsService.batchRateSrs(userId, ratings);
  }

  @Post('check-duplicates')
  checkDuplicates(
    @CurrentUser() userId: string,
    @Body() dto: CheckDuplicatesDto,
  ) {
    const words = (dto.words ?? []).slice(0, 200);
    return this.wordDedupService.findDuplicates(userId, words);
  }

  @Get(':id')
  findOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.cardsService.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateCardDto) {
    return this.cardsService.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: UpdateCardDto) {
    return this.cardsService.update(userId, id, dto);
  }

  @Delete('clear')
  clearByCollection(@CurrentUser() userId: string, @Query('collectionId') collectionId: string) {
    if (!collectionId) throw new BadRequestException('collectionId is required');
    return this.cardsService.clearByCollection(userId, collectionId);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.cardsService.remove(userId, id);
  }
}
