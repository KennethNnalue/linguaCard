import {TestBed} from '@angular/core/testing';
import {BrowserPronunciationAudioService} from './browser-pronunciation-audio.service';

describe('BrowserPronunciationAudioService', () => {
  let fetchAudio: jest.Mock;
  let decode: jest.Mock;
  let createUrl: jest.Mock;
  let revokeUrl: jest.Mock;
  const properties = ['fetch', 'OfflineAudioContext'] as const;
  const originalProperties = properties.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  beforeEach(() => {
    fetchAudio = jest.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)}));
    decode = jest.fn(async () => ({sampleRate: 24000, length: 2, numberOfChannels: 1, getChannelData: () => new Float32Array([0.8, -0.8])}));
    let urlIndex = 0;
    createUrl = jest.fn(() => `blob:padded-${++urlIndex}`);
    revokeUrl = jest.fn();
    class Decoder { decodeAudioData = decode; }
    Object.defineProperty(globalThis, 'fetch', {configurable: true, value: fetchAudio});
    Object.defineProperty(globalThis, 'OfflineAudioContext', {configurable: true, value: Decoder});
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: createUrl});
    Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: revokeUrl});
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    for (let index = 0; index < properties.length; index++) {
      const descriptor = originalProperties[index];
      if (descriptor) Object.defineProperty(globalThis, properties[index], descriptor);
      else Reflect.deleteProperty(globalThis, properties[index]);
    }
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('prepares a cached WAV resource once for repeated and concurrent requests', async () => {
    const service = TestBed.inject(BrowserPronunciationAudioService);
    const [first, second] = await Promise.all([service.prepare('blob:source', 1), service.prepare('blob:source', 1)]);
    expect(first).toBe(second);
    expect(await service.prepare('blob:source', 1)).toBe(first);
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({type: 'audio/wav'}));
  });

  it('bounds memory and revokes padded resources when destroyed', async () => {
    const service = TestBed.inject(BrowserPronunciationAudioService);
    for (let index = 0; index < 33; index++) await service.prepare(`blob:source-${index}`, 1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(revokeUrl).toHaveBeenCalledTimes(33);
  });

  it('propagates failed audio loading instead of playing an unprotected clip', async () => {
    fetchAudio.mockResolvedValueOnce({ok: false});
    const service = TestBed.inject(BrowserPronunciationAudioService);
    await expect(service.prepare('blob:broken', 1)).rejects.toThrow('could not be loaded');
    expect(createUrl).not.toHaveBeenCalled();
  });
});
