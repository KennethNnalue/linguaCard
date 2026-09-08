import { TestBed } from '@angular/core/testing';
import type { AdminPodcastTranscriptPromptResult } from '@lingua-card/shared/domain';
import { of } from 'rxjs';
import { AdminPodcastApiService } from '../data-access/admin-podcast-api.service';
import { PodcastTranscriptClipboardService } from './podcast-transcript-clipboard.service';

describe('PodcastTranscriptClipboardService', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    TestBed.resetTestingModule();
  });

  it('copies a ready manifest-bound prompt', async () => {
    const result: AdminPodcastTranscriptPromptResult = {
      status: 'ready', prompt: 'Generate this episode', manifestId: 'a'.repeat(64),
    };
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    TestBed.configureTestingModule({ providers: [
      PodcastTranscriptClipboardService,
      { provide: AdminPodcastApiService, useValue: {
        createTranscriptPrompt: jest.fn(() => of(result)),
      } },
    ] });

    const response = await TestBed.inject(PodcastTranscriptClipboardService).copy(
      'episode', ['die Wohnung, -en'], 'Apartment tour',
    );

    expect(response).toEqual(result);
    expect(writeText).toHaveBeenCalledWith(result.prompt);
  });

  it('returns genuine ambiguities without touching the clipboard', async () => {
    const result: AdminPodcastTranscriptPromptResult = {
      status: 'needs_resolution',
      ambiguities: [{
        key: 'band', text: 'Band', article: null,
        candidates: [{
          lexemeId: '11111111-1111-5111-a111-111111111111', text: 'Band',
          translation: 'volume', definition: null, partOfSpeech: 'noun', article: 'der',
        }],
      }],
    };
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    TestBed.configureTestingModule({ providers: [
      PodcastTranscriptClipboardService,
      { provide: AdminPodcastApiService, useValue: {
        createTranscriptPrompt: jest.fn(() => of(result)),
      } },
    ] });

    const response = await TestBed.inject(PodcastTranscriptClipboardService).copy(
      'episode', ['Band'],
    );

    expect(response).toEqual(result);
    expect(writeText).not.toHaveBeenCalled();
  });
});
