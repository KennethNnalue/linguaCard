import {
  Body, Controller, Get, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import type {
  WordAudioResolveResponse,
  WordAudioBatchResolveResponse,
} from '@lingua-card/shared/domain';
import { ResolveWordAudioDto, BatchResolveWordAudioDto } from '@lingua-card/shared/dto';
import { WordAudioService } from './word-audio.service';

@Controller('word-audio')
export class WordAudioController {
  constructor(private readonly wordAudioService: WordAudioService) {}

  @Post('resolve')
  resolve(@Body() dto: ResolveWordAudioDto): Promise<WordAudioResolveResponse> {
    return this.wordAudioService.resolve(dto.text, dto.language ?? 'de-DE');
  }

  @Post('batch-resolve')
  async batchResolve(@Body() dto: BatchResolveWordAudioDto): Promise<WordAudioBatchResolveResponse> {
    const words = (dto.words ?? []).slice(0, 50);
    return this.wordAudioService.batchResolve(words);
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
