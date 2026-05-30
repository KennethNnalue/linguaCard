import { Body, Controller, HttpException, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { GeminiAdapter } from './providers/gemini.adapter';
import { StorageService } from '../storage/storage.service';

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
   * Generates pronunciation audio for a vocabulary card and persists it to
   * R2 (or local disk in dev). Returns a permanent public URL so the client
   * can store it and avoid regenerating on every session.
   *
   * Storage key: pronunciation/{cardId}.wav
   */
  @Post('pronunciation')
  async pronunciation(
    @Body() dto: PronunciationRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const speech = await this.gemini.generateSpeech({
        text: dto.text,
        voice: dto.voice,
        language: dto.language ?? 'de-DE',
      });

      const storagePath = `pronunciation/${dto.cardId}.wav`;
      const audioUrl = await this.storage.upload(
        Buffer.from(speech.audioBuffer),
        storagePath,
        'audio/wav',
      );

      res.json({ audioUrl, durationMs: speech.durationMs });
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
