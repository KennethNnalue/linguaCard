import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';

const CACHE_DIRECTORY = 'artwork-v1';

export function artworkCacheFileName(url: string): string {
  // Two independent 32-bit FNV-style lanes keep this synchronous in WebViews
  // and test environments where Web Crypto is unavailable.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of url) {
    const codePoint = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ codePoint, 0x01000193);
    second = Math.imul(second ^ codePoint, 0x85ebca6b);
  }
  const hash = `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();
  const extension = pathname.match(/\.(avif|gif|jpe?g|png|webp)$/i)?.[1]?.toLowerCase() ?? 'img';
  return `${hash}.${extension}`;
}

@Injectable({ providedIn: 'root' })
export class OfflineImageCacheService {
  private readonly downloads = new Map<string, Promise<void>>();

  async resolve(remoteUrl: string | null | undefined): Promise<string | null> {
    if (!remoteUrl) return null;
    if (Capacitor.getPlatform() === 'web' || this.isLocalUrl(remoteUrl)) return remoteUrl;

    const fileName = artworkCacheFileName(remoteUrl);
    const path = `${CACHE_DIRECTORY}/${fileName}`;
    const cached = await this.localUrl(path);
    if (cached) return cached;

    const { connected } = await Network.getStatus();
    if (!connected) return null;

    // Render immediately while persisting in the background. The next view or
    // process launch resolves the same URL to the durable native file.
    this.cacheInBackground(path, remoteUrl);
    return remoteUrl;
  }

  private cacheInBackground(path: string, remoteUrl: string): void {
    if (this.downloads.has(path)) return;
    const download = (async () => {
      try {
        await Filesystem.mkdir({ path: CACHE_DIRECTORY, directory: Directory.Data, recursive: true });
        await Filesystem.downloadFile({ path, url: remoteUrl, directory: Directory.Data });
      } catch {
        // The remote image remains visible online; a later view retries caching.
      } finally {
        this.downloads.delete(path);
      }
    })();
    this.downloads.set(path, download);
  }

  private async localUrl(path: string): Promise<string | null> {
    try {
      const stat = await Filesystem.stat({ path, directory: Directory.Data });
      if (stat.size <= 0) return null;
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(uri);
    } catch {
      return null;
    }
  }

  private isLocalUrl(url: string): boolean {
    return /^(blob:|data:|file:|capacitor:|https:\/\/localhost\/_capacitor_file_)/i.test(url);
  }
}
