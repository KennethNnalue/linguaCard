import {AiAudioCacheService, audioExtensionFromUrl, detectAudioMimeType} from './ai-audio-cache.service';

describe('audio cache format detection', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('uses the object path extension instead of defaulting MP3 files to WAV', () => {
    expect(audioExtensionFromUrl('https://audio.example/word-audio/hash.mp3?version=1')).toBe('mp3');
    expect(audioExtensionFromUrl('https://audio.example/word-audio/hash.wav')).toBe('wav');
  });

  it('recognizes legacy MP3 bytes that were stored without MIME metadata', () => {
    expect(detectAudioMimeType(new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer)).toBe('audio/mpeg');
    expect(detectAudioMimeType(new Uint8Array([0xff, 0xfb, 0x90, 0x64]).buffer)).toBe('audio/mpeg');
  });

  it('treats RIFF data as WAV', () => {
    expect(detectAudioMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer)).toBe('audio/wav');
  });

  it('downloads web audio bytes and persists them for offline playback', async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(bytes),
    });
    Object.defineProperty(globalThis, 'fetch', {configurable: true, value: fetchMock});
    const service = new AiAudioCacheService();
    const saveBuffer = jest.spyOn(service, 'saveBuffer').mockResolvedValue('blob:cached-audio');

    await expect(service.saveFromUrl('word-key', 'https://audio.example/word.mp3'))
      .resolves.toBe('blob:cached-audio');

    expect(fetchMock).toHaveBeenCalledWith('https://audio.example/word.mp3');
    expect(saveBuffer).toHaveBeenCalledWith('word-key', bytes, 'mp3');
  });
});
