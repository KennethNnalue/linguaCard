import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import type {
  AdminPodcastTopicListItem,
  AdminPodcastTranscriptPayload,
  CefrLevel,
  LanguageCode,
} from '@lingua-card/shared/domain';
import { addIcons } from 'ionicons';
import {
  addOutline, arrowBackOutline, checkmarkCircleOutline, chevronDownOutline, copyOutline,
  documentTextOutline, imageOutline, informationCircleOutline, micOutline,
  pencilOutline, refreshOutline,
} from 'ionicons/icons';
import { PodcastTranscriptClipboardService } from '../../application/podcast-transcript-clipboard.service';
import { AdminPodcastStore } from '../../store/admin-podcast.store';

type UploadFeedback = {
  fileName: string;
  previewUrl?: string;
  status: 'uploading' | 'success' | 'error';
  message: string;
};

@Component({
  selector: 'lc-admin-podcast-topics',
  standalone: true,
  imports: [IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonToolbar, ReactiveFormsModule],
  providers: [AdminPodcastStore],
  templateUrl: './admin-podcast-topics.page.html',
  styleUrl: './admin-podcast-topics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class AdminPodcastTopicsPage implements OnInit, OnDestroy {
  readonly store = inject(AdminPodcastStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(AppNotificationService);
  private readonly transcriptClipboard = inject(PodcastTranscriptClipboardService);
  readonly isNewEpisodeScreen = this.route.snapshot.data['podcastView'] === 'new-episode';

  readonly levels: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly languages: readonly LanguageCode[] = ['de', 'en', 'es', 'tr', 'uk', 'ru', 'ar'];
  readonly activeStep = signal<1 | 2 | 3 | null>(1);
  readonly viewMode = signal<'list' | 'create' | 'topic'>('list');
  readonly selectedTopicId = signal<string | null>(null);
  private readonly requestedTopicId = signal<string | null>(null);
  readonly selectedTopic = computed(() => {
    const topicId = this.selectedTopicId();
    return this.store.topics().find(topic => topic.id === topicId) ?? null;
  });
  readonly lastCreatedEpisode = computed(() => {
    const episodeId = this.store.lastCreatedEpisodeId();
    return this.selectedTopic()?.episodes.find(episode => episode.id === episodeId) ?? null;
  });
  readonly topicImageFeedback = signal<Record<string, UploadFeedback>>({});
  readonly episodeImageFeedback = signal<Record<string, UploadFeedback>>({});
  readonly transcriptFeedback = signal<Record<string, UploadFeedback>>({});

  readonly topicForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    targetLanguage: new FormControl<LanguageCode>('de', { nonNullable: true }),
    translationLanguage: new FormControl<LanguageCode>('en', { nonNullable: true }),
    level: new FormControl<CefrLevel>('A1', { nonNullable: true }),
  });

  readonly episodeForm = new FormGroup({
    vocabulary: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    direction: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    addIcons({
      arrowBackOutline, copyOutline, documentTextOutline, imageOutline,
      informationCircleOutline, micOutline, refreshOutline, checkmarkCircleOutline,
      chevronDownOutline, pencilOutline, addOutline,
    });

    effect(() => {
      const topicId = this.store.lastCreatedTopicId();
      if (!topicId) return;
      untracked(() => void this.router.navigate(['/admin/podcasts', topicId, 'new-episode']));
    });

    effect(() => {
      const topicId = this.requestedTopicId();
      if (!topicId || !this.store.topics().some(topic => topic.id === topicId)) return;
      const step = this.route.snapshot.data['podcastView'] === 'new-episode' ? 2 : 3;
      untracked(() => this.openTopic(topicId, step));
    });

    effect(() => {
      const topicId = this.store.lastUploadedTopicThumbnailId();
      if (!topicId) return;
      untracked(() => this.markUploadSuccessful(this.topicImageFeedback, topicId, 'Image uploaded successfully.'));
    });

    effect(() => {
      const episodeId = this.store.lastUploadedEpisodeThumbnailId();
      if (!episodeId) return;
      untracked(() => this.markUploadSuccessful(this.episodeImageFeedback, episodeId, 'Image uploaded successfully.'));
    });

    effect(() => {
      const episodeId = this.store.transcriptEpisodeId();
      const status = this.store.transcriptStatus();
      if (!episodeId || status === 'idle') return;
      untracked(() => {
        if (status === 'loading') {
          this.updateUploadMessage(this.transcriptFeedback, episodeId, 'uploading', 'Validating and importing transcript…');
        } else if (status === 'error') {
          this.updateUploadMessage(this.transcriptFeedback, episodeId, 'error', 'Transcript could not be imported. Check the file and try again.');
        } else if (status === 'success') {
          this.markUploadSuccessful(this.transcriptFeedback, episodeId, 'Transcript imported successfully.');
        }
      });
    });

    effect(() => {
      const episodeId = this.store.lastCreatedEpisodeId();
      if (!episodeId) return;
      const topic = this.selectedTopic();
      const episode = topic?.episodes.find(item => item.id === episodeId);
      if (!topic || !episode || episode.status === 'queued' || episode.status === 'generating') return;
      untracked(() => {
        if (episode.status !== 'failed') {
          this.prepareEpisodeForm();
          void this.router.navigate(['/admin/podcasts', topic.id]);
        }
      });
    });
  }

  ngOnInit(): void {
    this.store.loadTopics();
    const view = this.route.snapshot.data['podcastView'];
    if (view === 'create') this.prepareNewTopic();
    else this.requestedTopicId.set(this.route.snapshot.paramMap.get('topicId'));
  }

  ngOnDestroy(): void {
    this.revokePreviewUrls(this.topicImageFeedback());
    this.revokePreviewUrls(this.episodeImageFeedback());
  }

  goBack(): void {
    if (this.viewMode() !== 'list') {
      this.showTopicList();
      return;
    }
    void this.router.navigate(['/admin/import']);
  }

  createTopic(): void {
    if (this.topicForm.invalid) return;
    this.store.createTopic(this.topicForm.getRawValue());
  }

  saveTopic(): void {
    const topic = this.selectedTopic();
    if (!topic || this.topicForm.invalid) return;
    const value = this.topicForm.getRawValue();
    this.store.updateTopic({
      topicId: topic.id,
      dto: {
        title: value.title,
        description: value.description,
        level: value.level,
      },
    });
  }

  selectTopic(topicId: string, step: 1 | 2 | 3): void {
    void this.router.navigate(step === 2
      ? ['/admin/podcasts', topicId, 'new-episode']
      : ['/admin/podcasts', topicId]);
  }

  private openTopic(topicId: string, step: 1 | 2 | 3): void {
    const topic = this.store.topics().find(item => item.id === topicId);
    if (!topic) return;
    this.selectedTopicId.set(topic.id);
    this.topicForm.setValue({
      title: topic.title,
      description: topic.description,
      targetLanguage: topic.targetLanguage,
      translationLanguage: topic.translationLanguage,
      level: topic.level,
    });
    this.topicForm.controls.targetLanguage.disable();
    this.topicForm.controls.translationLanguage.disable();
    this.prepareEpisodeForm();
    this.viewMode.set('topic');
    this.activeStep.set(step);
  }

  startNewTopic(): void {
    void this.router.navigate(['/admin/podcasts/new']);
  }

  private prepareNewTopic(): void {
    this.selectedTopicId.set(null);
    this.topicForm.controls.targetLanguage.enable();
    this.topicForm.controls.translationLanguage.enable();
    this.topicForm.reset({
      title: '', description: '', targetLanguage: 'de',
      translationLanguage: 'en', level: 'A1',
    });
    this.episodeForm.reset({
      vocabulary: '', direction: '',
    });
    this.viewMode.set('create');
    this.activeStep.set(1);
  }

  showTopicList(): void {
    this.selectedTopicId.set(null);
    this.viewMode.set('list');
    this.activeStep.set(null);
    this.store.clearError();
    this.store.clearSuccess();
    void this.router.navigate(['/admin/podcasts']);
  }

  addEpisode(): void {
    const topic = this.selectedTopic();
    if (!topic) return;
    void this.router.navigate(['/admin/podcasts', topic.id, 'new-episode']);
  }

  openStep(step: 1 | 2 | 3): void {
    if (step > 1 && !this.selectedTopic()) return;
    this.activeStep.update(activeStep => activeStep === step ? null : step);
  }

  private prepareEpisodeForm(): void {
    this.episodeForm.reset({
      vocabulary: '',
      direction: '',
    });
  }

  createEpisode(): void {
    if (this.episodeForm.invalid) return;
    const topic = this.selectedTopic();
    if (!topic) return;
    const value = this.episodeForm.getRawValue();
    const vocabulary = this.parseVocabulary(value.vocabulary);
    if (!vocabulary.length) {
      this.store.setLocalError('Add at least one vocabulary item before generating an episode.');
      return;
    }
    this.store.createEpisode({
      topicId: topic.id,
      dto: {
        requestId: crypto.randomUUID(),
        vocabulary,
        direction: value.direction.trim() || undefined,
      },
    });
  }

  createEpisodeDraft(): void {
    const topic = this.selectedTopic();
    if (topic) this.store.createEpisodeDraft(topic.id);
  }

  generateTranscript(episodeId: string, vocabularyText: string): void {
    const vocabulary = this.parseVocabulary(vocabularyText);
    if (!vocabulary.length) {
      this.store.setLocalError('Add at least one vocabulary item before generating a transcript.');
      return;
    }
    this.store.generateTranscript({ episodeId, vocabulary });
  }

  createElevenLabsPodcast(episodeId: string, vocabularyText: string): void {
    const vocabulary = this.parseVocabulary(vocabularyText);
    if (!vocabulary.length) {
      this.store.setLocalError('Add at least one vocabulary item before creating the podcast.');
      return;
    }
    this.store.createElevenLabsPodcast({ episodeId, vocabulary });
  }

  private parseVocabulary(value: string): string[] {
    return value.split(/[,\n]/u).map(item => item.trim()).filter(Boolean);
  }

  uploadTopicThumbnail(
    topicId: string,
    event: Event,
    description: string,
  ): void {
    const file = this.selectedFile(event);
    if (!file) return;
    this.setImageFeedback(this.topicImageFeedback, topicId, file);
    const topic = this.store.topics().find(item => item.id === topicId);
    const accessibilityDescription = description.trim() || `${topic?.title ?? 'Podcast topic'} cover artwork`;
    this.store.uploadTopicThumbnail({
      topicId,
      upload: {
        file,
        accessibilityDescription,
        focalPointX: 0.5,
        focalPointY: 0.5,
      },
    });
  }

  uploadEpisodeThumbnail(
    episodeId: string,
    event: Event,
    description: string,
  ): void {
    const file = this.selectedFile(event);
    if (!file) return;
    this.setImageFeedback(this.episodeImageFeedback, episodeId, file);
    const episode = this.store.topics().flatMap(topic => topic.episodes)
      .find(item => item.id === episodeId);
    const accessibilityDescription = description.trim() || `${episode?.title ?? 'Podcast episode'} artwork`;
    this.store.uploadEpisodeThumbnail({
      episodeId,
      upload: {
        file,
        accessibilityDescription,
        focalPointX: 0.5,
        focalPointY: 0.5,
      },
    });
  }

  async previewTranscript(episodeId: string, event: Event): Promise<void> {
    const file = this.selectedFile(event);
    if (!file) return;
    this.transcriptFeedback.update(feedback => ({
      ...feedback,
      [episodeId]: { fileName: file.name, status: 'uploading', message: 'Reading transcript file…' },
    }));
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.isTranscriptPayload(parsed)) throw new Error('Invalid transcript shape');
      this.store.previewTranscript({ episodeId, payload: parsed });
    } catch {
      this.store.setLocalError('Choose a valid podcast transcript JSON file.');
      this.updateUploadMessage(this.transcriptFeedback, episodeId, 'error', 'This file is not valid podcast transcript JSON.');
    }
  }

  formatDuration(milliseconds: number): string {
    const totalSeconds = Math.round(milliseconds / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  hasPublishedEpisode(topic: AdminPodcastTopicListItem): boolean {
    return topic.episodes.some(episode => episode.status === 'published');
  }

  async copyTranscriptPrompt(
    episode: AdminPodcastTopicListItem['episodes'][number],
    preferredVocabulary: string,
  ): Promise<void> {
    try {
      const vocabulary = this.parseVocabulary(preferredVocabulary);
      if (!vocabulary.length) {
        this.store.setLocalError('Add at least one vocabulary item before copying the prompt.');
        return;
      }
      await this.transcriptClipboard.copy(episode.id, vocabulary);
      await this.notifications.present({
        message: 'AI transcript prompt copied.',
        duration: 2200,
        color: 'success',
      });
    } catch {
      await this.notifications.present({
        message: 'Could not copy the prompt. Check this browser’s clipboard permission.',
        duration: 3500,
        color: 'danger',
      });
    }
  }

  private isTranscriptPayload(value: unknown): value is AdminPodcastTranscriptPayload {
    if (!isRecord(value)) return false;
    return value['schemaVersion'] === 1 && Array.isArray(value['speakers'])
      && Array.isArray(value['turns']) && Array.isArray(value['vocabulary']);
  }

  private selectedFile(event: Event): File | null {
    if (!(event.target instanceof HTMLInputElement)) return null;
    const file = event.target.files?.item(0) ?? null;
    event.target.value = '';
    return file;
  }

  private setImageFeedback(
    feedbackSignal: typeof this.topicImageFeedback,
    id: string,
    file: File,
  ): void {
    const previous = feedbackSignal()[id];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    feedbackSignal.update(feedback => ({
      ...feedback,
      [id]: {
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
        message: 'Uploading image…',
      },
    }));
  }

  private markUploadSuccessful(
    feedbackSignal: typeof this.topicImageFeedback,
    id: string,
    message: string,
  ): void {
    this.updateUploadMessage(feedbackSignal, id, 'success', message);
  }

  private updateUploadMessage(
    feedbackSignal: typeof this.topicImageFeedback,
    id: string,
    status: UploadFeedback['status'],
    message: string,
  ): void {
    const current = feedbackSignal()[id];
    if (!current) return;
    feedbackSignal.update(feedback => ({ ...feedback, [id]: { ...current, status, message } }));
  }

  private revokePreviewUrls(feedback: Record<string, UploadFeedback>): void {
    for (const item of Object.values(feedback)) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
