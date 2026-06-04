import { Injectable, Logger } from '@nestjs/common';
import { WordAudioService } from './word-audio.service';

interface AudioItem {
  text: string;
  language: string;
}

/**
 * Throttled background queue for lower-priority audio generation (plural forms
 * and synonym examples). Runs at 1 call per 400 ms so it never competes with
 * the primary word/example audio that batchResolve handles at import time.
 *
 * Fire-and-forget — callers enqueue items and return immediately.
 * A shared drain loop processes the queue in the background.
 */
@Injectable()
export class SynonymAudioPrefetchService {
  private readonly logger = new Logger(SynonymAudioPrefetchService.name);
  private readonly queue: AudioItem[] = [];
  private draining = false;

  /** 400 ms between calls = 150 RPM, well below the Google Cloud TTS quota. */
  private static readonly DRAIN_INTERVAL_MS = 400;
  /** Safety cap: prevents unbounded queue growth on a very large backfill run. */
  private static readonly MAX_QUEUE_SIZE = 500;

  constructor(private readonly wordAudio: WordAudioService) {}

  /** Add items to the background queue. Returns immediately — non-blocking. */
  enqueue(items: AudioItem[]): void {
    for (const item of items) {
      if (this.queue.length >= SynonymAudioPrefetchService.MAX_QUEUE_SIZE) break;
      this.queue.push(item);
    }
    if (!this.draining) void this._drain();
  }

  private async _drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.wordAudio.resolve(item.text, item.language);
      } catch (err) {
        this.logger.warn(`Synonym audio prefetch failed for "${item.text}"`, err);
      }
      await new Promise<void>(r =>
        setTimeout(r, SynonymAudioPrefetchService.DRAIN_INTERVAL_MS),
      );
    }
    this.draining = false;
  }
}
