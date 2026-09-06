import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController, IonButton, IonContent, IonIcon, IonInput, IonItem,
  IonSelect, IonSelectOption, IonSpinner, IonTextarea,
} from '@ionic/angular/standalone';
import type { AdminPodcastTranscriptPayload, CefrLevel, LanguageCode } from '@lingua-card/shared/domain';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, cafeOutline, checkmarkCircleOutline, chevronForwardOutline, cloudUploadOutline, documentTextOutline, micOutline, pencilOutline, refreshOutline, sparklesOutline, trashOutline } from 'ionicons/icons';
import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { PodcastTranscriptClipboardService } from '../../application/podcast-transcript-clipboard.service';
import { AdminPodcastStore } from '../../store/admin-podcast.store';

type StudioView = 'library' | 'topic' | 'new-topic' | 'new-episode' | 'review';

@Component({ selector: 'lc-admin-podcast-topics', standalone: true, imports: [IonButton, IonContent, IonIcon, IonInput, IonItem, IonSelect, IonSelectOption, IonSpinner, IonTextarea, ReactiveFormsModule], providers: [AdminPodcastStore], templateUrl: './admin-podcast-topics.page.html', styleUrl: './admin-podcast-topics.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class AdminPodcastTopicsPage implements OnInit {
  readonly store = inject(AdminPodcastStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(AppNotificationService);
  private readonly clipboard = inject(PodcastTranscriptClipboardService);
  private readonly alerts = inject(AlertController);
  readonly levels: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
  readonly languages: readonly LanguageCode[] = ['de', 'en', 'es', 'tr', 'uk', 'ru', 'ar'];
  readonly view = signal<StudioView>('library');
  readonly topicId = signal<string | null>(null);
  readonly pendingTranscript = signal<AdminPodcastTranscriptPayload | null>(null);
  readonly pendingPromptWords = signal<readonly string[] | null>(null);
  readonly transcriptOpen = signal(false);
  readonly transcriptReviewed = signal(false);
  readonly topic = computed(() => this.store.topics().find(item => item.id === this.topicId()) ?? null);
  readonly episode = computed(() => {
    const topic = this.topic();
    const routeEpisodeId = this.route.snapshot.paramMap.get('episodeId');
    if (routeEpisodeId) return topic?.episodes.find(item => item.id === routeEpisodeId) ?? null;
    const createdEpisodeId = this.store.lastCreatedEpisodeId();
    return createdEpisodeId
      ? topic?.episodes.find(item => item.id === createdEpisodeId) ?? null
      : null;
  });
  readonly topicForm = new FormGroup({ title: new FormControl('', { nonNullable: true, validators: Validators.required }), targetLanguage: new FormControl<LanguageCode>('de', { nonNullable: true }), translationLanguage: new FormControl<LanguageCode>('en', { nonNullable: true }), level: new FormControl<CefrLevel>('A1', { nonNullable: true }), description: new FormControl('', { nonNullable: true }) });
  readonly editTopicForm = new FormGroup({ title: new FormControl('', { nonNullable: true, validators: Validators.required }), level: new FormControl<CefrLevel>('A1', { nonNullable: true }), description: new FormControl('', { nonNullable: true }) });
  readonly episodeForm = new FormGroup({ vocabulary: new FormControl('', { nonNullable: true, validators: Validators.required }), direction: new FormControl('', { nonNullable: true }) });
  readonly detailsForm = new FormGroup({ title: new FormControl('', { nonNullable: true, validators: Validators.required }), translation: new FormControl('', { nonNullable: true }), description: new FormControl('', { nonNullable: true }) });

  constructor() {
    addIcons({ addOutline, arrowBackOutline, cafeOutline, checkmarkCircleOutline, chevronForwardOutline, cloudUploadOutline, documentTextOutline, micOutline, pencilOutline, refreshOutline, sparklesOutline, trashOutline });
    effect(() => { const id = this.store.lastCreatedTopicId(); if (id && this.view() === 'new-topic') untracked(() => void this.router.navigate(['/admin/podcasts', id])); });
    effect(() => { const item = this.episode(); if (item) untracked(() => { this.detailsForm.patchValue({ title: item.title, translation: item.titleTranslation, description: item.description }); this.transcriptReviewed.set(Boolean(item.audioUrl) || item.status === 'published'); if (this.view() === 'review' && !item.hasTranscript) void this.router.navigate(['/admin/podcasts', item.topicId, 'episodes', item.id, 'transcript']); }); });
    effect(() => {
      const item = this.episode();
      const transcript = this.store.transcriptDetails();
      const status = this.store.transcriptStatus();
      const transcriptView = this.view() === 'new-episode' || this.view() === 'review';
      if (!transcriptView || !item?.hasTranscript || transcript?.episodeId === item.id
        || status === 'loading'
        || (status === 'error' && this.store.transcriptEpisodeId() === item.id)) return;
      untracked(() => this.store.loadTranscript(item.id));
    });
    effect(() => { const item = this.topic(); if (item) untracked(() => this.editTopicForm.patchValue({ title: item.title, level: item.level, description: item.description })); });
    effect(() => { const id = this.store.lastCreatedEpisodeId(), payload = this.pendingTranscript(); if (id && payload) untracked(() => { this.store.previewTranscript({ episodeId: id, payload }); this.pendingTranscript.set(null); }); });
    effect(() => { const id = this.store.lastCreatedEpisodeId(), words = this.pendingPromptWords(); if (id && words) untracked(() => { this.pendingPromptWords.set(null); void this.copyPromptForEpisode(id, words); }); });
    effect(() => { const id = this.store.lastDeletedTopicId(); if (id && id === this.topicId()) untracked(() => void this.router.navigate(['/admin/podcasts'])); });
    effect(() => { const id = this.store.lastDeletedEpisodeId(); if (id && id === this.route.snapshot.paramMap.get('episodeId')) untracked(() => void this.router.navigate(['/admin/podcasts', this.topicId()])); });
  }
  refresh(): void { this.store.loadTopics(); }
  ngOnInit(): void { this.store.loadTopics(); this.topicId.set(this.route.snapshot.paramMap.get('topicId')); const value = this.route.snapshot.data['podcastView']; this.view.set(value === 'create' ? 'new-topic' : value === 'new-episode' ? 'new-episode' : value === 'review' ? 'review' : this.topicId() ? 'topic' : 'library'); }
  goBack(): void {
    if ((this.view() === 'new-episode' || this.view() === 'review') && this.topicId()) {
      void this.router.navigate(['/admin/podcasts', this.topicId()]);
      return;
    }
    if (this.view() !== 'library') {
      void this.router.navigate(['/admin/podcasts']);
      return;
    }
    void this.router.navigate(['/admin/import']);
  }
  show(view: StudioView): void {
    if (view === 'library') void this.router.navigate(['/admin/podcasts']);
    else if (view === 'new-topic') void this.router.navigate(['/admin/podcasts/new']);
    else if (view === 'new-episode' && this.topicId()) void this.router.navigate(['/admin/podcasts', this.topicId(), 'episodes', 'new']);
    else if (view === 'topic' && this.topicId()) void this.router.navigate(['/admin/podcasts', this.topicId()]);
  }
  createTopic(): void { if (this.topicForm.valid) this.store.createTopic(this.topicForm.getRawValue()); }
  updateTopic(): void { const topic = this.topic(); if (topic && this.editTopicForm.valid) this.store.updateTopic({ topicId: topic.id, dto: this.editTopicForm.getRawValue() }); }
  updateEpisode(): void { const episode = this.episode(); if (episode && this.detailsForm.valid) { const value = this.detailsForm.getRawValue(); this.store.updateEpisode({ episodeId: episode.id, dto: { title: value.title, titleTranslation: value.translation, description: value.description } }); } }
  createEpisode(): void { const topic = this.topic(); if (!topic || this.episodeForm.invalid) return; const value = this.episodeForm.getRawValue(); const vocabulary = this.words(value.vocabulary); if (!vocabulary.length) { this.store.setLocalError('Add at least one vocabulary item.'); return; } this.store.createEpisode({ topicId: topic.id, dto: { requestId: crypto.randomUUID(), vocabulary, direction: value.direction.trim() || undefined } }); }
  submitTranscriptStep(): void { if (this.route.snapshot.paramMap.get('episodeId')) this.generateTranscriptForEpisode(); else this.createEpisode(); }
  openTopic(id: string): void { void this.router.navigate(['/admin/podcasts', id]); }
  openEpisode(topicId: string | null, episodeId: string | null): void { if (!topicId || !episodeId) return; const episode = this.store.topics().find(topic => topic.id === topicId)?.episodes.find(item => item.id === episodeId); void this.router.navigate(['/admin/podcasts', topicId, 'episodes', episodeId, episode?.hasTranscript ? 'review' : 'transcript']); }
  reviewTranscript(): void { const episode = this.episode(); if (!episode?.hasTranscript) return; this.transcriptOpen.set(true); if (this.store.transcriptDetails()?.episodeId !== episode.id) this.store.loadTranscript(episode.id); }
  closeTranscript(): void { this.transcriptOpen.set(false); }
  completeTranscriptReview(): void {
    if (this.store.transcriptStatus() !== 'success' || !this.store.transcriptDetails()) return;
    this.transcriptReviewed.set(true);
    this.transcriptOpen.set(false);
  }
  openTranscriptWorkspace(): void { const episode = this.episode(); if (episode && episode.status !== 'published') void this.router.navigate(['/admin/podcasts', episode.topicId, 'episodes', episode.id, 'transcript']); }
  generateTranscriptForEpisode(): void {
    const episode = this.episode();
    const vocabulary = this.words(this.episodeForm.controls.vocabulary.value);
    if (!episode || !vocabulary.length) {
      this.store.setLocalError('Add at least one vocabulary item before generating the transcript.');
      return;
    }
    this.store.generateTranscript({ episodeId: episode.id, vocabulary });
  }
  publishEpisode(): void { const episode = this.episode(); if (episode) this.store.publishEpisode(episode.id); }
  publishTopic(): void { const topic = this.topic(); if (topic) this.store.publishTopic(topic.id); }
  hasPublishedEpisode(): boolean { return this.topic()?.episodes.some(episode => episode.status === 'published') ?? false; }
  async deleteTopic(): Promise<void> { const topic = this.topic(); if (!topic || !await this.confirm(`Delete “${topic.title}” and all of its episodes?`)) return; this.store.deleteTopic(topic.id); }
  async deleteEpisode(): Promise<void> { const episode = this.episode(); if (!episode || !await this.confirm(`Delete “${episode.title}”?`)) return; this.store.deleteEpisode(episode.id); }
  uploadTopicThumbnail(event: Event): void { const topic = this.topic(), file = this.selectedFile(event); if (topic && file) this.store.uploadTopicThumbnail({ topicId: topic.id, upload: { file, accessibilityDescription: `${topic.title} cover artwork`, focalPointX: .5, focalPointY: .5 } }); }
  uploadEpisodeThumbnail(event: Event): void { const episode = this.episode(), file = this.selectedFile(event); if (episode && file) this.store.uploadEpisodeThumbnail({ episodeId: episode.id, upload: { file, accessibilityDescription: `${episode.title} artwork`, focalPointX: .5, focalPointY: .5 } }); }
  async copyPrompt(): Promise<void> { const episode = this.episode(), topicId = this.topicId(), words = this.words(this.episodeForm.controls.vocabulary.value); if (episode) { await this.copyPromptForEpisode(episode.id, words); return; } if (!topicId) return; this.pendingPromptWords.set(words); this.store.createEpisodeDraft(topicId); }
  async uploadTranscript(event: Event): Promise<void> { const file = this.selectedFile(event); if (!file) return; try { const parsed: unknown = JSON.parse(await file.text()); if (!this.isTranscriptPayload(parsed)) throw new Error('Invalid transcript'); const episode = this.episode(), topicId = this.topicId(); if (episode) this.store.previewTranscript({ episodeId: episode.id, payload: parsed }); else if (topicId) { this.pendingTranscript.set(parsed); this.store.createEpisodeDraft(topicId); } } catch { this.store.setLocalError('Choose a valid podcast transcript JSON file.'); } }
  createAudio(): void { const episode = this.episode(); if (episode) this.store.generateAudio(episode.id); }
  formatDuration(ms: number): string { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  speakerName(key: string): string { return this.store.transcriptDetails()?.speakers.find(speaker => speaker.key === key)?.name ?? key; }
  languageName(code: LanguageCode): string { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase(); }
  private words(value: string): string[] { return value.split(/[\n,]/u).map(word => word.trim()).filter(Boolean); }
  private selectedFile(event: Event): File | null { if (!(event.target instanceof HTMLInputElement)) return null; const file = event.target.files?.item(0) ?? null; event.target.value = ''; return file; }
  private isTranscriptPayload(value: unknown): value is AdminPodcastTranscriptPayload { return isRecord(value) && value['schemaVersion'] === 1 && Array.isArray(value['speakers']) && Array.isArray(value['turns']) && Array.isArray(value['vocabulary']); }
  private async copyPromptForEpisode(episodeId: string, words: readonly string[]): Promise<void> { try { await this.clipboard.copy(episodeId, [...words]); await this.notifications.present({ message: 'Generation prompt copied.', duration: 1800, color: 'success' }); } catch { this.store.setLocalError('Could not copy the generation prompt.'); } }
  private async confirm(message: string): Promise<boolean> { const alert = await this.alerts.create({ header: 'Confirm deletion', message, buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Delete', role: 'destructive' }] }); await alert.present(); const result = await alert.onDidDismiss(); return result.role === 'destructive'; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
