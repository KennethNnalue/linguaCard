import {DestroyRef, inject, Injectable} from '@angular/core';
import {Capacitor} from '@capacitor/core';
import {pronunciationWithLeadIn} from './pronunciation-audio-padding';

const MAX_PADDED_CLIPS = 32;

@Injectable({providedIn: 'root'})
export class BrowserPronunciationAudioService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly clips = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private decoder: OfflineAudioContext | null = null;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      for (const url of this.clips.values()) URL.revokeObjectURL(url);
      this.clips.clear();
    });
  }

  async prepare(url: string, rate: number): Promise<string> {
    if (Capacitor.isNativePlatform() || typeof OfflineAudioContext === 'undefined') return url;
    const key = `${rate}:${url}`;
    const cached = this.clips.get(key);
    if (cached) {
      this.clips.delete(key);
      this.clips.set(key, cached);
      return cached;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const preparation = this.padClip(url, rate, key).finally(() => this.pending.delete(key));
    this.pending.set(key, preparation);
    return preparation;
  }

  private async padClip(url: string, rate: number, key: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Pronunciation audio could not be loaded.');
    this.decoder ??= new OfflineAudioContext(1, 1, 24000);
    const audio = await this.decoder.decodeAudioData(await response.arrayBuffer());
    if (this.destroyed) return url;
    // The lead-in is part of the same resource, so an output fade on play()
    // affects silence rather than the first phoneme, including after TTS.
    const paddedUrl = URL.createObjectURL(new Blob([pronunciationWithLeadIn(audio, rate)], {type: 'audio/wav'}));
    this.clips.set(key, paddedUrl);
    if (this.clips.size > MAX_PADDED_CLIPS) {
      const oldest = this.clips.entries().next().value;
      if (oldest) {
        this.clips.delete(oldest[0]);
        URL.revokeObjectURL(oldest[1]);
      }
    }
    return paddedUrl;
  }
}
