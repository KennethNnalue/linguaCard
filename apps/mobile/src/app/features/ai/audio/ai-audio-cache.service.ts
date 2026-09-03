import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// IndexedDB database name and store for web-platform audio cache.
const WEB_DB_NAME    = 'lc-audio-cache';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'audio-blobs';

interface CachedWebAudio {
  buffer: ArrayBuffer;
  mimeType: string;
}

export function audioExtensionFromUrl(url: string): 'wav' | 'mp3' {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
  } catch {
    return url.toLowerCase().split(/[?#]/, 1)[0].endsWith('.mp3') ? 'mp3' : 'wav';
  }
}

export function detectAudioMimeType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  const startsWithId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const startsWithMp3Frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return startsWithId3 || startsWithMp3Frame ? 'audio/mpeg' : 'audio/wav';
}

@Injectable({ providedIn: 'root' })
export class AiAudioCacheService {
  private readonly CACHE_DIR = 'ai-audio-v2';

  private get isNative(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  // Lazily opened IndexedDB connection (web only).
  private _webDb: IDBDatabase | null = null;

  // Session-level blob URL cache: cacheKey → blob URL.
  // Prevents creating duplicate blob URLs for the same audio across repeated
  // getFromCache() / saveFromUrl() calls within a single app session.
  private readonly _blobUrlMap = new Map<string, string>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Used for story audio (large files, one per story).
   *
   * Native: downloads to device filesystem so the story plays offline.
   * Web: returns the remote URL directly. The browser's built-in HTTP cache
   * handles repeat plays (304 Not Modified) — fetching the whole file into
   * IndexedDB would double-download a large file and trigger CORS errors on
   * the static file server. Story audio is not suitable for IndexedDB caching.
   */
  async getOrDownload(storyId: string, remoteUrl: string | null): Promise<string | null> {
    if (!remoteUrl) return null;
    if (!this.isNative) return remoteUrl;
    return this._nativeGetOrDownload(storyId, remoteUrl);
  }

  /**
   * Download a remote audio file and persist it under the given cacheKey.
   * Idempotent: skips the download if the file is already cached.
   * Returns a playable local URL (Capacitor URI on native, blob: URL on web).
   */
  async saveFromUrl(
    cacheKey: string,
    remoteUrl: string,
    ext?: 'wav' | 'mp3',
  ): Promise<string | null> {
    const resolvedExt = ext ?? audioExtensionFromUrl(remoteUrl);
    if (this.isNative) {
      return this._nativeSaveFromUrl(cacheKey, remoteUrl, resolvedExt);
    }

    // Web: check session map and IndexedDB first to avoid re-downloading.
    const cached = await this._webGet(cacheKey);
    if (cached) return cached;

    try {
      const audio = await this._fetchAudio(remoteUrl, resolvedExt);
      const blobUrl = this._makeBlobUrl(audio.buffer, audio.mimeType);
      await this._webPut(cacheKey, audio);
      this._blobUrlMap.set(cacheKey, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }

  async saveBuffer(cacheKey: string, audioBuffer: ArrayBuffer, ext: 'wav' | 'mp3' = 'wav'): Promise<string | null> {
    if (this.isNative) {
      return this._nativeSaveBuffer(cacheKey, audioBuffer, ext);
    }

    // Web: check session map first, then store in IndexedDB.
    const cached = await this._webGet(cacheKey);
    if (cached) return cached;

    try {
      const mime    = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      const blobUrl = this._makeBlobUrl(audioBuffer, mime);
      await this._webPut(cacheKey, {buffer: audioBuffer, mimeType: mime});
      this._blobUrlMap.set(cacheKey, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }

  async getFromCache(cacheKey: string): Promise<string | null> {
    if (this.isNative) {
      return this._findExistingPath(cacheKey);
    }
    return this._webGet(cacheKey);
  }

  async evict(storyId: string): Promise<void> {
    if (this.isNative) {
      for (const ext of ['wav', 'mp3']) {
        try {
          await Filesystem.deleteFile({
            path: `${this.CACHE_DIR}/${storyId}.${ext}`,
            directory: Directory.Data,
          });
        } catch {
          // File may not exist
        }
      }
    } else {
      await this._webDelete(storyId);
    }
  }

  async getCacheSize(): Promise<number> {
    if (!this.isNative) return 0;
    try {
      const result = await Filesystem.readdir({ path: this.CACHE_DIR, directory: Directory.Data });
      let total = 0;
      for (const file of result.files) {
        try {
          const stat = await Filesystem.stat({
            path: `${this.CACHE_DIR}/${file.name}`,
            directory: Directory.Data,
          });
          total += stat.size;
        } catch { /* ignore */ }
      }
      return total;
    } catch {
      return 0;
    }
  }

  // ── Native (Capacitor Filesystem) helpers ──────────────────────────────────

  private async _nativeGetOrDownload(storyId: string, remoteUrl: string): Promise<string | null> {
    const ext  = remoteUrl.endsWith('.wav') ? 'wav' : 'mp3';
    const path = `${this.CACHE_DIR}/${storyId}.${ext}`;

    try {
      const stat = await Filesystem.stat({ path, directory: Directory.Data });
      if (stat.size > 0) {
        const result = await Filesystem.getUri({ path, directory: Directory.Data });
        return Capacitor.convertFileSrc(result.uri);
      }
    } catch { /* not cached yet */ }

    try {
      await Filesystem.mkdir({ path: this.CACHE_DIR, directory: Directory.Data, recursive: true });
      await Filesystem.downloadFile({ path, url: remoteUrl, directory: Directory.Data });
      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio cache download failed for story ${storyId}:`, err);
      return remoteUrl;
    }
  }

  private async _nativeSaveFromUrl(
    cacheKey: string,
    remoteUrl: string,
    ext: 'wav' | 'mp3',
  ): Promise<string | null> {
    const existing = await this._findExistingPath(cacheKey);
    if (existing) return existing;

    const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
    try {
      await Filesystem.mkdir({ path: this.CACHE_DIR, directory: Directory.Data, recursive: true });
      await Filesystem.downloadFile({ path, url: remoteUrl, directory: Directory.Data });
      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio saveFromUrl failed for key ${cacheKey}:`, err);
      return null;
    }
  }

  private async _nativeSaveBuffer(
    cacheKey: string,
    audioBuffer: ArrayBuffer,
    ext: 'wav' | 'mp3',
  ): Promise<string | null> {
    const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
    try {
      await Filesystem.mkdir({ path: this.CACHE_DIR, directory: Directory.Data, recursive: true });
      const base64 = this._arrayBufferToBase64(audioBuffer);
      await Filesystem.writeFile({ path, data: base64, directory: Directory.Data });
      const result = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(result.uri);
    } catch (err) {
      console.error(`Audio cache write failed for key ${cacheKey}:`, err);
      throw err;
    }
  }

  private async _findExistingPath(cacheKey: string): Promise<string | null> {
    for (const ext of ['wav', 'mp3'] as const) {
      const path = `${this.CACHE_DIR}/${cacheKey}.${ext}`;
      try {
        const stat = await Filesystem.stat({ path, directory: Directory.Data });
        if (stat.size > 0) {
          const result = await Filesystem.getUri({ path, directory: Directory.Data });
          return Capacitor.convertFileSrc(result.uri);
        }
      } catch { /* try next extension */ }
    }
    return null;
  }

  // ── Web (IndexedDB) helpers ────────────────────────────────────────────────

  private _openDb(): Promise<IDBDatabase> {
    if (this._webDb) return Promise.resolve(this._webDb);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(WEB_STORE_NAME);
      };
      req.onsuccess = () => {
        this._webDb = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Returns a playable blob: URL if the key exists in IndexedDB, otherwise null.
   * Reuses the session-level blob URL if already created — avoids leaking blob URLs
   * from repeated calls for the same key within one app session.
   */
  private async _webGet(key: string): Promise<string | null> {
    // Session hit — no need to touch IndexedDB at all.
    if (this._blobUrlMap.has(key)) return this._blobUrlMap.get(key)!;

    try {
      const db = await this._openDb();
      const cached = await new Promise<ArrayBuffer | CachedWebAudio | undefined>((resolve, reject) => {
        const tx  = db.transaction(WEB_STORE_NAME, 'readonly');
        const req = tx.objectStore(WEB_STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as ArrayBuffer | CachedWebAudio | undefined);
        req.onerror   = () => reject(req.error);
      });

      if (!cached) return null;

      const audio = cached instanceof ArrayBuffer
        ? {buffer: cached, mimeType: detectAudioMimeType(cached)}
        : cached;
      const url = this._makeBlobUrl(audio.buffer, audio.mimeType);
      this._blobUrlMap.set(key, url);
      return url;
    } catch {
      return null;
    }
  }

  private async _webPut(key: string, audio: CachedWebAudio): Promise<void> {
    try {
      const db = await this._openDb();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(WEB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WEB_STORE_NAME);
        const req   = store.put(audio, key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch { /* non-fatal */ }
  }

  private async _webDelete(key: string): Promise<void> {
    try {
      const db = await this._openDb();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(WEB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WEB_STORE_NAME);
        const req   = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch { /* non-fatal */ }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private async _fetchAudio(url: string, fallbackExtension: 'wav' | 'mp3'): Promise<CachedWebAudio> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const responseType = response.headers.get('content-type')?.split(';')[0]?.trim();
    return {
      buffer,
      mimeType: responseType?.startsWith('audio/')
        ? responseType
        : fallbackExtension === 'mp3' ? 'audio/mpeg' : 'audio/wav',
    };
  }

  /**
   * Create a blob URL from an ArrayBuffer.
   * mimeHint can be a full mime type ('audio/wav') or an extension hint ('wav', 'mp3').
   */
  private _makeBlobUrl(buffer: ArrayBuffer, mimeHint: string): string {
    const mime = mimeHint.includes('/')
      ? mimeHint
      : mimeHint === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    return URL.createObjectURL(new Blob([buffer], { type: mime }));
  }


  private _arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
