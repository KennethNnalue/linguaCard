import {audioExtensionFromUrl, detectAudioMimeType} from './ai-audio-cache.service';

describe('audio cache format detection', () => {
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
});
