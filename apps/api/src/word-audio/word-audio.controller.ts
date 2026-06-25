import {
  Body, Controller, Get, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import type {
  WordAudioResolveResponse,
  WordAudioBatchResolveResponse,
} from '@lingua-card/shared/domain';
import { ResolveWordAudioDto, BatchResolveWordAudioDto } from '@lingua-card/shared/dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { WordAudioService } from './word-audio.service';

@Controller('word-audio')
export class WordAudioController {
  constructor(
    private readonly wordAudioService: WordAudioService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  // Tiering: everyone reads the global HD cache, but only Pro can trigger NEW
  // generation (then cached + reused by all). Free users get cached HD when it
  // exists, else null → the client falls back to Web Speech.
  @Post('resolve')
  async resolve(
    @CurrentUser() userId: string,
    @Body() dto: ResolveWordAudioDto,
  ): Promise<WordAudioResolveResponse> {
    const generate = await this.subscriptions.isProUser(userId);
    return this.wordAudioService.resolve(dto.text, dto.language ?? 'de-DE', { generate });
  }

  @Post('batch-resolve')
  async batchResolve(
    @CurrentUser() userId: string,
    @Body() dto: BatchResolveWordAudioDto,
  ): Promise<WordAudioBatchResolveResponse> {
    const generate = await this.subscriptions.isProUser(userId);
    return this.wordAudioService.batchResolve(dto.words ?? [], { generate });
  }

  // Must appear before @Get(':id') so 'lookup' is not treated as an id
  @Get('lookup')
  async lookup(
    @Query('text') text: string,
    @Query('lang') lang?: string,
  ) {
    const wordAudio = await this.wordAudioService.findByText(text, lang ?? 'de-DE');
    if (!wordAudio) throw new NotFoundException('Word audio not found');
    return wordAudio;
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const wordAudio = await this.wordAudioService.findById(id);
    if (!wordAudio) throw new NotFoundException('Word audio not found');
    return wordAudio;
  }
}
