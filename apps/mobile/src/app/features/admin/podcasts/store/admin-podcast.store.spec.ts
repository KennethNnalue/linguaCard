import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { AdminPodcastTopicListItem, AdminPodcastTranscriptPayload, AdminPodcastTranscriptPreview } from '@lingua-card/shared/domain';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { PodcastTranscriptClipboardService } from '../application/podcast-transcript-clipboard.service';
import { AdminPodcastTopicsPage } from '../pages/admin-podcast-topics/admin-podcast-topics.page';
import { of, Subject, throwError } from 'rxjs';
import { AdminPodcastApiService } from '../data-access/admin-podcast-api.service';
import { AdminPodcastStore } from './admin-podcast.store';

const payload: AdminPodcastTranscriptPayload = {
  schemaVersion: 1,
  speakers: [{ key: 'anna', name: 'Anna', voiceGender: 'female' }],
  turns: [{ speakerKey: 'anna', targetText: 'Hallo', translation: 'Hello', vocabularyRefs: [] }],
  vocabulary: [],
};
const preview: AdminPodcastTranscriptPreview = {
  episodeId: 'episode', episode: null, fingerprint: 'fingerprint', status: 'valid',
  counts: { speakers: 1, turns: 1, vocabulary: 0, resolvedVocabulary: 0, newVocabulary: 0 },
  estimatedDurationMs: 1000, conflicts: [], vocabulary: [],
};
const result = {
  episodeId: 'episode', title: 'Conversation', titleTranslation: 'Conversation', description: '',
  fingerprint: 'fingerprint', speakerCount: 1, turnCount: 1, vocabularyCount: 0, estimatedDurationMs: 1000,
};

describe('AdminPodcastStore transcript completion', () => {
  function setup() {
    const topic: AdminPodcastTopicListItem = {
      id: 'topic', externalId: 'topic', title: 'Topic', description: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1', status: 'draft', thumbnail: null, createdAt: '', updatedAt: '',
      episodes: [{
        id: 'episode', topicId: 'topic', externalId: 'episode', title: 'Draft', titleTranslation: '',
        description: '', level: 'A1', position: 0, audioDurationMs: 0, audioUrl: null, audioVersion: 0,
        generationError: null, generationRequestId: null, elevenLabsProjectId: null, hasTranscript: false,
        estimatedDurationMs: 0, status: 'draft', thumbnail: null, createdAt: '', updatedAt: '',
      }],
    };
    const api = {
      listTopics: jest.fn(() => of([topic])),
      getTranscript: jest.fn(() => of({ episodeId: 'episode', speakers: payload.speakers, turns: payload.turns })),
      previewTranscript: jest.fn(() => of(preview)),
      generateTranscript: jest.fn(() => of({ payload, preview })),
      commitTranscript: jest.fn(() => of(result)),
      deleteEpisode: jest.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({ providers: [AdminPodcastStore, { provide: AdminPodcastApiService, useValue: api }] });
    const store = TestBed.inject(AdminPodcastStore);
    store.loadTopics();
    return { api, store };
  }

  it.each(['import', 'generate'])('completes %s only after persistence succeeds', path => {
    const { api, store } = setup();
    const saved = new Subject<typeof result>();
    api.commitTranscript.mockReturnValue(saved);
    if (path === 'import') store.previewTranscript({ episodeId: 'episode', payload });
    else store.generateTranscript({ episodeId: 'episode', vocabulary: ['Hallo'] });
    expect(store.transcriptStatus()).toBe('loading');
    expect(store.completedTranscriptEpisodeId()).toBeNull();
    saved.next(result);
    saved.complete();
    expect(store.completedTranscriptEpisodeId()).toBe('episode');
    expect(store.transcriptStatus()).toBe('success');
    expect(store.transcriptPayload()).toBeNull();
    expect(store.success()).toContain('successfully');
    expect(store.topics()[0].episodes[0]).toMatchObject({ hasTranscript: true, title: result.title, estimatedDurationMs: 1000 });
  });

  it.each(['import', 'generate'])('advances %s to review and announces success', path => {
    const navigate = jest.fn().mockResolvedValue(true);
    const present = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      { provide: AppNotificationService, useValue: { present } },
      { provide: PodcastTranscriptClipboardService, useValue: {} },
      { provide: AlertController, useValue: {} },
    ] });
    const { store } = setup();
    const page = TestBed.runInInjectionContext(() => new AdminPodcastTopicsPage());
    page.topicId.set('topic');
    page.view.set('new-episode');
    TestBed.tick();
    expect(navigate).not.toHaveBeenCalled();
    if (path === 'import') store.previewTranscript({ episodeId: 'episode', payload });
    else store.generateTranscript({ episodeId: 'episode', vocabulary: ['Hallo'] });
    TestBed.tick();
    expect(navigate).toHaveBeenCalledWith(['/admin/podcasts', 'topic', 'episodes', 'episode', 'review']);
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }));
  });

  it('shows conflicts without committing and allows a corrected upload', () => {
    const { api, store } = setup();
    api.previewTranscript.mockReturnValueOnce(of({ ...preview, status: 'conflicts', conflicts: [{
      code: 'unknown-reference', pointer: '/turns/0/speakerKey', severity: 'error',
      message: 'Unknown speaker.', remediation: 'Use a declared speaker key.',
    }] }));
    store.previewTranscript({ episodeId: 'episode', payload });
    expect(api.commitTranscript).not.toHaveBeenCalled();
    expect(store.completedTranscriptEpisodeId()).toBeNull();
    expect(store.transcriptStatus()).toBe('error');
    expect(store.error()).toContain('/turns/0/speakerKey: Unknown speaker. Use a declared speaker key.');
    store.previewTranscript({ episodeId: 'episode', payload });
    expect(store.error()).toBeNull();
    expect(store.completedTranscriptEpisodeId()).toBe('episode');
  });

  it.each(['previewTranscript', 'commitTranscript'] as const)('does not complete when %s fails', method => {
    const { api, store } = setup();
    api[method].mockReturnValueOnce(throwError(() => new HttpErrorResponse({
      status: 400, error: { message: ['turns must contain at least 1 elements'] },
    })));
    store.previewTranscript({ episodeId: 'episode', payload });
    expect(store.transcriptStatus()).toBe('error');
    expect(store.completedTranscriptEpisodeId()).toBeNull();
    expect(store.error()).toContain('turns must contain');
    store.previewTranscript({ episodeId: 'episode', payload });
    expect(store.completedTranscriptEpisodeId()).toBe('episode');
  });

  it('keeps the imported transcript when an older transcript request finishes later', () => {
    const { api, store } = setup();
    const staleTranscript = new Subject<{ episodeId: string; speakers: AdminPodcastTranscriptPayload['speakers']; turns: AdminPodcastTranscriptPayload['turns'] }>();
    api.getTranscript.mockReturnValue(staleTranscript);

    store.loadTranscript('episode');
    store.previewTranscript({ episodeId: 'episode', payload });
    staleTranscript.next({
      episodeId: 'episode',
      speakers: [{ key: 'old-speaker', name: 'Old speaker', voiceGender: 'male' }],
      turns: [{
        speakerKey: 'old-speaker', targetText: 'Old transcript',
        translation: 'Old translation', vocabularyRefs: [],
      }],
    });
    staleTranscript.complete();

    expect(store.transcriptDetails()).toEqual({
      episodeId: 'episode', speakers: payload.speakers, turns: payload.turns,
    });
  });

  it.each(['new-episode', 'review'] as const)('returns to the updated topic after deleting from %s', view => {
    const navigate = jest.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      { provide: AppNotificationService, useValue: {} },
      { provide: PodcastTranscriptClipboardService, useValue: {} },
      { provide: AlertController, useValue: {} },
    ] });
    const { store } = setup();
    const page = TestBed.runInInjectionContext(() => new AdminPodcastTopicsPage());
    page.topicId.set('topic');
    page.view.set(view);

    store.deleteEpisode('episode');
    TestBed.tick();

    expect(store.topics()[0].episodes).toEqual([]);
    expect(navigate).toHaveBeenCalledWith(['/admin/podcasts', 'topic']);
  });
});
