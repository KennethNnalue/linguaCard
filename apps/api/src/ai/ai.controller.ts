import { Body, Controller, forwardRef, HttpException, Inject, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { GeminiAdapter } from './providers/gemini.adapter';
import { StorageService } from '../storage/storage.service';
import { WordAudioService } from '../word-audio/word-audio.service';

interface TtsRequestDto {
  text: string;
  voice?: string;
  language?: string;
}

interface PronunciationRequestDto {
  cardId: string;
  text: string;
  language?: string;
  voice?: string;
}

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly gemini: GeminiAdapter,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => WordAudioService))
    private readonly wordAudio: WordAudioService,
  ) {}

  @Post('tts')
  async tts(@Body() dto: TtsRequestDto, @Res() res: Response): Promise<void> {
    try {
      const speech = await this.gemini.generateSpeech({
        text: dto.text,
        voice: dto.voice,
        language: dto.language ?? 'de-DE',
      });

      const ext = speech.mimeType.includes('mp3') ? 'mp3' : 'wav';
      res.set({
        'Content-Type': speech.mimeType,
        'Content-Disposition': `inline; filename="tts.${ext}"`,
        'Content-Length': speech.audioBuffer.byteLength,
      });
      res.send(Buffer.from(speech.audioBuffer));
    } catch (err) {
      this.handleTtsError(err, res);
    }
  }

  /**
   * Pronunciation endpoint — now delegates to the global word audio registry.
   * cardId is accepted for backward compatibility but ignored; audio is keyed
   * by normalized text so identical words share one R2 file across all cards.
   *
   * Response is backward-compatible (audioUrl + durationMs) with two new
   * optional fields: wordAudioId and cached.
   */
  @Post('pronunciation')
  async pronunciation(
    @Body() dto: PronunciationRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.wordAudio.resolve(dto.text, dto.language ?? 'de-DE');
      res.json({
        audioUrl: result.wordAudio.audioUrl,
        durationMs: result.wordAudio.durationMs,
        wordAudioId: result.wordAudio.id,
        cached: result.cached,
      });
    } catch (err) {
      this.handleTtsError(err, res);
    }
  }

  private handleTtsError(err: unknown, res: Response): void {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse() as object;
      if (status === 429) {
        const retryAfterMs = (body as any).retryAfterMs ?? 30_000;
        res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      }
      res.status(status).json(body);
    } else {
      this.logger.error('TTS unexpected error', err);
      res.status(503).json({ message: 'TTS service temporarily unavailable' });
    }
  }
}
