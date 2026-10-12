import {TestBed} from '@angular/core/testing';
import {BrowserTranslationSpeechService} from './browser-translation-speech.service';

class TestUtterance extends EventTarget {
  lang = '';
  rate = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: {error: string}) => void) | null = null;
  constructor(readonly text: string) { super(); }
}

describe('BrowserTranslationSpeechService', () => {
  let utterances: TestUtterance[];
  let cancel: jest.Mock;
  let resume: jest.Mock;
  let service: BrowserTranslationSpeechService;

  beforeEach(() => {
    jest.useFakeTimers();
    utterances = [];
    cancel = jest.fn();
    resume = jest.fn();
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable: true, value: TestUtterance});
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {cancel, resume, speak: (utterance: TestUtterance) => utterances.push(utterance)},
    });
    TestBed.configureTestingModule({});
    service = TestBed.inject(BrowserTranslationSpeechService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('activates speech synchronously during the first click', () => {
    window.dispatchEvent(new MouseEvent('click'));
    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.volume).toBe(0);
    window.dispatchEvent(new MouseEvent('click'));
    expect(utterances).toHaveLength(1);
  });

  it('speaks the translation and waits for its end before advancing', async () => {
    const completion = jest.fn();
    const speaking = service.speak('computer problem', 'en-US', 0.95).then(completion);
    expect(utterances[0]?.lang).toBe('en-US');
    expect(utterances[0]?.rate).toBe(0.95);
    expect(resume).toHaveBeenCalled();
    utterances[0]?.onstart?.();
    await Promise.resolve();
    expect(completion).not.toHaveBeenCalled();
    utterances[0]?.onend?.();
    await speaking;
    expect(completion).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports a blocked utterance instead of leaving playback pending forever', async () => {
    const speaking = service.speak('computer problem', 'en-US');
    const failure = expect(speaking).rejects.toThrow('Translation speech did not complete');
    jest.advanceTimersByTime(5000);
    await failure;
    expect(cancel).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports missing completion after speech has started', async () => {
    const speaking = service.speak('computer problem', 'en-US');
    const failure = expect(speaking).rejects.toThrow('Translation speech did not complete');
    utterances[0]?.onstart?.();
    jest.advanceTimersByTime(30000);
    await failure;
  });

  it('settles cancelled speech and allows the next translation to complete', async () => {
    const previous = service.speak('old translation', 'en-US');
    const next = service.speak('new translation', 'en-US');
    await previous;
    expect(utterances[0]?.onend).toBeNull();
    utterances[1]?.onstart?.();
    utterances[1]?.onend?.();
    await next;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('propagates speech errors with a settled promise', async () => {
    const speaking = service.speak('translation', 'en-US');
    const failure = expect(speaking).rejects.toThrow('not-allowed');
    utterances[0]?.onerror?.({error: 'not-allowed'});
    await failure;
    expect(jest.getTimerCount()).toBe(0);
  });
});
