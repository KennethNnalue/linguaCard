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
    jest.clearAllMocks();
    speak.mockResolvedValue();
    stop.mockResolvedValue();
  });

  it('uses platform TTS with the translation language and playback speed', async () => {
    const service = new NativeTranslationSpeechService();

    await service.speak('Message / News', 'en-US', 0.95);

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Message / News',
      lang: 'en-US',
      rate: 0.95,
    }));
  });
});
