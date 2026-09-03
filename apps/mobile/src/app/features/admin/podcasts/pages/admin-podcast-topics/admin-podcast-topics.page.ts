import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
import { buildPodcastTranscriptPrompt } from '../../domain/podcast-transcript-prompt';
import { nextEpisodeExternalId } from '../../domain/next-episode-external-id';
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
  private readonly notifications = inject(AppNotificationService);

  readonly levels: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly languages: readonly LanguageCode[] = ['de', 'en', 'es', 'tr', 'uk', 'ru', 'ar'];
  readonly activeStep = signal<1 | 2 | 3 | null>(1);
  readonly viewMode = signal<'list' | 'create' | 'topic'>('list');
  readonly selectedTopicId = signal<string | null>(null);
  readonly selectedTopic = computed(() => {
    const topicId = this.selectedTopicId();
    return this.store.topics().find(topic => topic.id === topicId) ?? null;
  });
  readonly topicImageFeedback = signal<Record<string, UploadFeedback>>({});
  readonly episodeImageFeedback = signal<Record<string, UploadFeedback>>({});
  readonly transcriptFeedback = signal<Record<string, UploadFeedback>>({});

  readonly topicForm = new FormGroup({
    externalId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    targetLanguage: new FormControl<LanguageCode>('de', { nonNullable: true }),
    translationLanguage: new FormControl<LanguageCode>('en', { nonNullable: true }),
    minimumLevel: new FormControl<CefrLevel>('A1', { nonNullable: true }),
    maximumLevel: new FormControl<CefrLevel>('A2', { nonNullable: true }),
  });

  readonly episodeForm = new FormGroup({
    topicId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    externalId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    titleTranslation: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    level: new FormControl<CefrLevel>('A1', { nonNullable: true }),
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
      untracked(() => this.selectTopic(topicId, 2));
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
      untracked(() => {
        const topic = this.selectedTopic();
        if (topic) this.prepareEpisodeForm(topic);
        this.activeStep.set(3);
      });
    });
  }

  ngOnInit(): void {
    this.store.loadTopics();
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
        minimumLevel: value.minimumLevel,
        maximumLevel: value.maximumLevel,
      },
    });
  }

  selectTopic(topicId: string, step: 1 | 2 | 3): void {
    const topic = this.store.topics().find(item => item.id === topicId);
    if (!topic) return;
    this.selectedTopicId.set(topic.id);
    this.topicForm.setValue({
      externalId: topic.externalId,
      title: topic.title,
      description: topic.description,
      targetLanguage: topic.targetLanguage,
      translationLanguage: topic.translationLanguage,
      minimumLevel: topic.minimumLevel,
      maximumLevel: topic.maximumLevel,
    });
    this.topicForm.controls.targetLanguage.disable();
    this.topicForm.controls.translationLanguage.disable();
    this.prepareEpisodeForm(topic);
    this.viewMode.set('topic');
    this.activeStep.set(step);
  }

  startNewTopic(): void {
    this.selectedTopicId.set(null);
    this.topicForm.controls.targetLanguage.enable();
    this.topicForm.controls.translationLanguage.enable();
    this.topicForm.reset({
      externalId: '', title: '', description: '', targetLanguage: 'de',
      translationLanguage: 'en', minimumLevel: 'A1', maximumLevel: 'A2',
    });
    this.episodeForm.reset({
      topicId: '', externalId: '', title: '', titleTranslation: '', description: '', level: 'A1',
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
  }

  addEpisode(): void {
    const topic = this.selectedTopic();
    if (!topic) return;
    this.prepareEpisodeForm(topic);
    this.activeStep.set(2);
  }

  openStep(step: 1 | 2 | 3): void {
    if (step > 1 && !this.selectedTopic()) return;
    this.activeStep.update(activeStep => activeStep === step ? null : step);
  }

  private prepareEpisodeForm(topic: AdminPodcastTopicListItem): void {
    this.episodeForm.reset({
      topicId: topic.id,
      externalId: nextEpisodeExternalId(topic),
      title: '',
      titleTranslation: '',
      description: '',
      level: topic.minimumLevel,
    });
  }

  createEpisode(): void {
    if (this.episodeForm.invalid) return;
    const { topicId, ...dto } = this.episodeForm.getRawValue();
    this.store.createEpisode({ topicId, dto });
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
    topic: AdminPodcastTopicListItem,
    episode: AdminPodcastTopicListItem['episodes'][number],
    preferredVocabulary: string,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        buildPodcastTranscriptPrompt(topic, episode, preferredVocabulary),
      );
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
