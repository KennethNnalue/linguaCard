import {Capacitor} from '@capacitor/core';
import {TestBed} from '@angular/core/testing';
import {BrowserTranslationSpeechService} from './browser-translation-speech.service';
import {AudioSegment} from '@lingua-card/shared/domain';
import {TextToSpeech} from '@capacitor-community/text-to-speech';
import {usesNativeTranslationSpeech} from './listen-playback.engine';
import {NativeTranslationSpeechService} from './native-translation-speech.service';

jest.mock('@capacitor-community/text-to-speech', () => ({
  QueueStrategy: {Flush: 0},
  TextToSpeech: {
    speak: jest.fn(),
    stop: jest.fn(),
  },
}));

describe('usesNativeTranslationSpeech', () => {
  it.each([
    ['word_native', true],
    ['example_native', true],
    ['word_target', false],
    ['example_target', false],
    ['silence', false],
  ] as const)('routes %s correctly', (type, expected) => {
    const segment = {type, text: 'text', language: 'en-US'} as AudioSegment;
    expect(usesNativeTranslationSpeech(segment)).toBe(expected);
  });
});

describe('NativeTranslationSpeechService', () => {
  const speak = TextToSpeech.speak as jest.MockedFunction<typeof TextToSpeech.speak>;
  const stop = TextToSpeech.stop as jest.MockedFunction<typeof TextToSpeech.stop>;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [{provide: BrowserTranslationSpeechService, useValue: {speak: jest.fn(), stop: jest.fn()}}]});
    jest.clearAllMocks();
    jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    speak.mockResolvedValue();
    stop.mockResolvedValue();
  });

  afterEach(() => jest.restoreAllMocks());

  it('routes browser translations to the gesture-aware browser service', async () => {
    jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const browser = TestBed.inject(BrowserTranslationSpeechService);
    const service = TestBed.runInInjectionContext(() => new NativeTranslationSpeechService());
    await service.speak('computer problem', 'en-US', 0.95);
    expect(browser.speak).toHaveBeenCalledWith('computer problem', 'en-US', 0.95);
    service.stop();
    expect(browser.stop).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it('uses platform TTS with the translation language and playback speed', async () => {
    const service = TestBed.runInInjectionContext(() => new NativeTranslationSpeechService());

    await service.speak('Message / News', 'en-US', 0.95);

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Message / News',
      lang: 'en-US',
      rate: 0.95,
      category: 'playback',
    }));
  });

  it('waits for the previous native utterance to stop before starting the next one', async () => {
    let finishStop!: () => void;
    stop.mockReturnValueOnce(new Promise<void>(resolve => { finishStop = resolve; }));
    const service = TestBed.runInInjectionContext(() => new NativeTranslationSpeechService());

    const speaking = service.speak('translation', 'en-US');
    await Promise.resolve();

    expect(speak).not.toHaveBeenCalled();
    finishStop();
    await speaking;
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('does not start an utterance that was cancelled while native stop was pending', async () => {
    let finishStop!: () => void;
    stop.mockReturnValueOnce(new Promise<void>(resolve => { finishStop = resolve; }));
    const service = TestBed.runInInjectionContext(() => new NativeTranslationSpeechService());

    const speaking = service.speak('stale translation', 'en-US');
    service.stop();
    finishStop();
    await speaking;

    expect(speak).not.toHaveBeenCalled();
  });
});
