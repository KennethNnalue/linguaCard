import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiAudioCacheService {
  private readonly CACHE_DIR = 'ai-audio';
  private readonly http = inject(HttpClient);

  async getOrDownload(storyId: string, remoteUrl: string | null): Promise<string | null> {
    if (!remoteUrl) return null;

    const path = `${this.CACHE_DIR}/${storyId}.mp3`;

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

  async saveBuffer(cacheKey: string, audioBuffer: ArrayBuffer): Promise<string> {
    const path = `${this.CACHE_DIR}/${cacheKey}.mp3`;
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
    const path = `${this.CACHE_DIR}/${cacheKey}.mp3`;
    try {
      const stat = await Filesystem.stat({ path, directory: Directory.Data });
      if (stat.size > 0) {
        const result = await Filesystem.getUri({ path, directory: Directory.Data });
        return Capacitor.convertFileSrc(result.uri);
      }
    } catch {
      // Not cached
    }
    return null;
  }

  async evict(storyId: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${this.CACHE_DIR}/${storyId}.mp3`,
        directory: Directory.Data,
      });
    } catch {
      // File may not exist — ignore
    }
  }

  async getCacheSize(): Promise<number> {
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
