import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { WordDictionaryService } from './word-dictionary.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import type { DictionaryBatchResolveResult, RawWordInput, WordDictionaryEntry } from '@lingua-card/shared/domain';

interface LookupDto {
  text: string;
  article?: string | null;
  targetLang?: string;
  nativeLang?: string;
}

interface BatchLookupDto {
  words: RawWordInput[];
  targetLang?: string;
  nativeLang?: string;
}

@Controller('word-dictionary')
export class WordDictionaryController {
  constructor(private readonly service: WordDictionaryService) {}

  @Post('lookup')
  @HttpCode(200)
  async lookup(@Body() dto: LookupDto): Promise<{ entry: WordDictionaryEntry | null }> {
    const entry = await this.service.lookup(
      dto.text,
      dto.article ?? null,
      dto.targetLang ?? 'de-DE',
      dto.nativeLang ?? 'en',
    );
    return { entry: entry ?? null };
  }

  /**
   * Read-only batch check — returns only words already in the dictionary.
   * Never calls AI. Use this on review screens where the user hasn't yet confirmed import.
   */
  @Post('batch-check')
  @HttpCode(200)
  async batchCheck(@Body() dto: BatchLookupDto): Promise<{ entries: WordDictionaryEntry[] }> {
    const entries = await this.service.batchCheck(dto.words, dto.targetLang ?? 'de-DE', dto.nativeLang ?? 'en');
    return { entries };
  }

  /**
   * Resolve batch — looks up existing entries and enriches misses via AI.
   * Use this at import-confirm time, not during review.
   */
  @Post('batch-lookup')
  @HttpCode(200)
  async batchLookup(@Body() dto: BatchLookupDto): Promise<DictionaryBatchResolveResult> {
    return this.service.batchResolve(dto.words, dto.targetLang ?? 'de-DE', dto.nativeLang ?? 'en');
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  async stats(): Promise<{ totalRequested: number; totalReused: number; totalEnriched: number; cacheHitRate: number; tokensSaved: number; dictionarySize?: number }> {
    return this.service.getStatsWithSize();
  }
}
