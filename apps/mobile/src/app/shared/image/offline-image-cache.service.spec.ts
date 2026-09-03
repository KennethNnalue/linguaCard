import { artworkCacheFileName } from './offline-image-cache.service';

describe('artworkCacheFileName', () => {
  it('is stable for the same URL and preserves a supported extension', async () => {
    const url = 'https://cdn.example.test/covers/story.webp?version=2';
    expect(await artworkCacheFileName(url)).toBe(await artworkCacheFileName(url));
    expect(await artworkCacheFileName(url)).toMatch(/^[a-f0-9]{16}\.webp$/);
  });

  it('changes when the remote asset URL changes', async () => {
    expect(await artworkCacheFileName('https://cdn.example.test/a.png'))
      .not.toBe(await artworkCacheFileName('https://cdn.example.test/b.png'));
  });
});
