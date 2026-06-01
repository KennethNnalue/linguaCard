import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class AiAudioCacheService {
  private readonly CACHE_DIR = 'ai-audio';

  // On web (ionic serve / PWA), Capacitor Filesystem maps to IndexedDB/OPFS and
  // convertFileSrc() returns a localhost path that the browser's <audio> element
  // cannot load. Skip the cache entirely and stream directly from the remote URL.
  private get isNative(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  async getOrDownload(storyId: string, remoteUrl: string | null): Promise<string | null> {
    if (!remoteUrl) return null;
    if (!this.isNative) return remoteUrl;

    const ext = remoteUrl.endsWith('.wav') ? 'wav' : 'mp3';
    const path = `${this.CACHE_DIR}/${storyId}.${ext}`;

    try {
      const stat = await Filesystem.stat({ path, directory: Directory.Data });
      if (stat.size > 0) {
        const result = await Filesystem.getUri({ path, directory: Directory.Data });
        return Capacitor.convertFileSrc(result.uri);
      }
    } catch {
      // File doesn't exist yet — fall through to download
    }

    try {
      await Filesystem.mkdir({
        path: this.CACHE_DIR,
        directory: Directory.Data,
        recursive: true,
      });

      await Filesystem.downloadFile({
        path,
        url: remoteUrl,
        directory: Directory.Data,
      });

      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio cache download failed for story ${storyId}:`, err);
      return remoteUrl;
    }
  }

  async saveBuffer(cacheKey: string, audioBuffer: ArrayBuffer, ext: 'wav' | 'mp3' = 'wav'): Promise<string | null> {
    if (!this.isNative) return null;

    const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
    try {
      await Filesystem.mkdir({
        path: this.CACHE_DIR,
        directory: Directory.Data,
        recursive: true,
      });

      const base64 = this.arrayBufferToBase64(audioBuffer);
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Data,
      });

      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio cache write failed for key ${cacheKey}:`, err);
      throw err;
    }
  }

  async getFromCache(cacheKey: string): Promise<string | null> {
    if (!this.isNative) return null;

    // Check both extensions: word audio is .wav, older story audio may be .mp3.
    for (const ext of ['wav', 'mp3'] as const) {
      const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
      try {
        const stat = await Filesystem.stat({ path, directory: Directory.Data });
        if (stat.size > 0) {
          const result = await Filesystem.getUri({ path, directory: Directory.Data });
          return Capacitor.convertFileSrc(result.uri);
        }
      } catch {
        // Not found with this extension — try next
      }
    }
    return null;
  }

  async evict(storyId: string): Promise<void> {
    if (!this.isNative) return;
    for (const ext of ['wav', 'mp3']) {
      try {
        await Filesystem.deleteFile({
          path: `${this.CACHE_DIR}/${storyId}.${ext}`,
          directory: Directory.Data,
        });
      } catch {
        // File may not exist — ignore
      }
    }
  }

  async getCacheSize(): Promise<number> {
    if (!this.isNative) return 0;
    try {
      const result = await Filesystem.readdir({
        path: this.CACHE_DIR,
        directory: Directory.Data,
      });
      let total = 0;
      for (const file of result.files) {
        try {
          const stat = await Filesystem.stat({
            path: `${this.CACHE_DIR}/${file.name}`,
            directory: Directory.Data,
          });
          total += stat.size;
        } catch {
          // Ignore stat errors for individual files
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
