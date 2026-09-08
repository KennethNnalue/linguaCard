import { audioCacheKey } from './audio-cache-key';

describe('audioCacheKey', () => {
  it('produces a bounded filesystem-safe identity for long phrases containing path characters', () => {
    const key = audioCacheKey(`Eine sehr lange Audio-Phrase / ${'Wort '.repeat(100)}`, 'de-DE');

    expect(key).toMatch(/^wa-[a-f0-9]{16}$/);
  });

  it('keeps language and normalized text in the identity', () => {
    expect(audioCacheKey('Die Rechnung.', 'de-DE')).toBe(audioCacheKey('die rechnung', 'de-DE'));
    expect(audioCacheKey('die Rechnung', 'de-DE')).not.toBe(audioCacheKey('die Rechnung', 'en-US'));
  });
});
