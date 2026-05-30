import { Body, Controller, HttpException, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { GeminiAdapter } from './providers/gemini.adapter';

interface TtsRequestDto {
  text: string;
  voice?: string;
  language?: string;
}

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly gemini: GeminiAdapter) {}

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
      if (err instanceof HttpException) {
        const status = err.getStatus();
        const body = err.getResponse() as object;
        // Forward 429 with Retry-After header so Angular can schedule a retry
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
}
