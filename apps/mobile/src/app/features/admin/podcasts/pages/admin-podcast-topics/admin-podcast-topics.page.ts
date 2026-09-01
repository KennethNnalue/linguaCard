import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import type {
  AdminPodcastTopicListItem,
  AdminPodcastTranscriptPayload,
  CefrLevel,
  LanguageCode,
} from '@lingua-card/shared/domain';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, copyOutline, documentTextOutline, imageOutline,
  informationCircleOutline, micOutline, refreshOutline,
} from 'ionicons/icons';
import { buildPodcastTranscriptPrompt } from '../../domain/podcast-transcript-prompt';
import { AdminPodcastStore } from '../../store/admin-podcast.store';

@Component({
  selector: 'lc-admin-podcast-topics',
  standalone: true,
  imports: [IonContent, IonHeader, IonIcon, IonToolbar, ReactiveFormsModule],
  providers: [AdminPodcastStore],
  templateUrl: './admin-podcast-topics.page.html',
  styleUrl: './admin-podcast-topics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPodcastTopicsPage implements OnInit {
  readonly store = inject(AdminPodcastStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(AppNotificationService);

  readonly levels: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly languages: readonly LanguageCode[] = ['de', 'en', 'es', 'tr', 'uk', 'ru', 'ar'];

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
      informationCircleOutline, micOutline, refreshOutline,
    });
  }

  ngOnInit(): void {
    this.store.loadTopics();
  }

  goBack(): void {
    void this.router.navigate(['/admin/import']);
  }

  createTopic(): void {
    if (this.topicForm.invalid) return;
    this.store.createTopic(this.topicForm.getRawValue());
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
    if (!description.trim()) {
      this.store.setLocalError('Describe the topic scene before choosing its image.');
      return;
    }
    this.store.uploadTopicThumbnail({
      topicId,
      upload: {
        file,
        accessibilityDescription: description.trim(),
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
    if (!description.trim()) {
      this.store.setLocalError('Describe the episode scene before choosing its image.');
      return;
    }
    this.store.uploadEpisodeThumbnail({
      episodeId,
      upload: {
        file,
        accessibilityDescription: description.trim(),
        focalPointX: 0.5,
        focalPointY: 0.5,
      },
    });
  }

  async previewTranscript(episodeId: string, event: Event): Promise<void> {
    const file = this.selectedFile(event);
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.isTranscriptPayload(parsed)) throw new Error('Invalid transcript shape');
      this.store.previewTranscript({ episodeId, payload: parsed });
    } catch {
      this.store.setLocalError('Choose a valid podcast transcript JSON file.');
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
