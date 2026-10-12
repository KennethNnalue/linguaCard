import {TestBed} from '@angular/core/testing';
import {PlaybackScript, PlayerStatus} from '@lingua-card/shared/domain';
import {WordAudioService} from '../../../shared/audio/word-audio.service';
import {DEFAULT_LISTEN_SETTINGS, VocabularyPlaylistItem} from '../models/listen.models';
import {ListenPlaybackEngine, PlaybackHost} from './listen-playback.engine';
import {NativeTranslationSpeechService} from './native-translation-speech.service';

const item: VocabularyPlaylistItem = {
  id: 'computer-problem', article: 'das', target: 'Computerproblem', native: 'computer problem',
  example: null, categoryIds: [], learningStage: 'new',
};
const script: PlaybackScript = {
  cardId: item.id,
  segments: [
    {type: 'word_target', text: 'das Computerproblem', language: 'de-DE'},
    {type: 'word_native', text: 'computer problem', language: 'en-US'},
    {type: 'example_target', text: 'Ich habe ein Computerproblem.', language: 'de-DE'},
    {type: 'example_native', text: 'I have a computer problem.', language: 'en-US'},
  ],
};

describe('ListenPlaybackEngine collection playback', () => {
  let status: PlayerStatus;
  let segmentIndex: number;
  let errorMessage: string | null;
  let speak: jest.Mock<Promise<void>, [string, string, number]>;
  let playRequired: jest.Mock<Promise<void>, [string, string, number]>;
  let engine: ListenPlaybackEngine;
  let completed: jest.Mock;

  beforeEach(() => {
    status = 'playing';
    segmentIndex = 0;
    errorMessage = null;
    speak = jest.fn().mockResolvedValue(undefined);
    playRequired = jest.fn().mockResolvedValue(undefined);
    completed = jest.fn();
    TestBed.configureTestingModule({providers: [
      {provide: WordAudioService, useValue: {playRequired, stop: jest.fn()}},
      {provide: NativeTranslationSpeechService, useValue: {speak, stop: jest.fn()}},
    ]});
    engine = TestBed.inject(ListenPlaybackEngine);
    const host: PlaybackHost = {
      currentScript: () => script,
      scriptAt: () => script,
      currentSegment: () => script.segments[segmentIndex] ?? null,
      status: () => status,
      settings: () => DEFAULT_LISTEN_SETTINGS,
      queue: () => [item],
      cardIndex: () => 0,
      segmentIndex: () => segmentIndex,
      downloadStatus: () => 'idle',
      patch: patch => {
        status = patch.status ?? status;
        segmentIndex = patch.segmentIndex ?? segmentIndex;
        if (patch.errorMessage !== undefined) errorMessage = patch.errorMessage;
      },
      saveSession: jest.fn(), cardCompleted: completed, sessionCompleted: jest.fn(),
    };
    engine.attach(host);
  });

  async function settleSequence(): Promise<void> {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  }

  it('plays German and English words and examples in order and completes the card', async () => {
    engine.restart();
    await settleSequence();
    expect(playRequired).toHaveBeenNthCalledWith(1, 'das Computerproblem', 'de-DE', 1);
    expect(speak).toHaveBeenNthCalledWith(1, 'computer problem', 'en-US', 1);
    expect(playRequired).toHaveBeenNthCalledWith(2, 'Ich habe ein Computerproblem.', 'de-DE', 1);
    expect(speak).toHaveBeenNthCalledWith(2, 'I have a computer problem.', 'en-US', 1);
    expect(status).toBe('complete');
    expect(completed).toHaveBeenCalledWith(item.id);
  });

  it('releases speech focus before every German segment, including the first word', async () => {
    const speech = TestBed.inject(NativeTranslationSpeechService);
    const stopped = jest.fn();
    jest.spyOn(speech, 'stop').mockImplementation(stopped);
    playRequired.mockImplementation(async () => {
      expect(stopped).toHaveBeenCalled();
      stopped.mockClear();
    });
    engine.restart();
    await settleSequence();
    expect(playRequired).toHaveBeenCalledTimes(2);
    expect(status).toBe('complete');
  });

  it('exposes translation failure and retries the same segment successfully', async () => {
    speak.mockRejectedValueOnce(new Error('Translation speech did not complete. Tap Play to try again.'));
    engine.restart();
    await settleSequence();
    expect(status).toBe('error');
    expect(segmentIndex).toBe(1);
    expect(errorMessage).toContain('Tap Play');
    engine.retrySegment();
    await settleSequence();
    expect(status).toBe('complete');
    expect(errorMessage).toBeNull();
  });
});
