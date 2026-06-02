import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { NgClass } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonIcon,
  IonSpinner,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparklesOutline, closeOutline, checkmarkOutline, lockClosedOutline } from 'ionicons/icons';
import type { GenerateStoryDto, StoryDifficulty, StoryLength } from '@lingua-card/shared/domain';
import { CollectionStore } from '../../../vault/store/collection.store';
import { StoryStore } from '../../store/story.store';
import { SubscriptionStore } from '../../../subscription/store/subscription.store';

type GenerationStep = 0 | 1 | 2 | 3;

@Component({
  selector: 'lc-generate-story-sheet',
  templateUrl: './generate-story-sheet.component.html',
  styleUrls: ['./generate-story-sheet.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, IonSpinner, NgClass],
})
export class GenerateStorySheetComponent implements OnDestroy {
  private readonly collectionStore = inject(CollectionStore);
  private readonly storyStore = inject(StoryStore);
  private readonly modalCtrl = inject(ModalController);
  readonly subscriptionStore = inject(SubscriptionStore);

  readonly collections = this.collectionStore.collections;
  readonly isGenerating = this.storyStore.isGenerating;
  readonly generateError = this.storyStore.generateError;

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedLength = signal<StoryLength>('medium');
  readonly selectedDifficulty = signal<StoryDifficulty>('B1');
  readonly generationStep = signal<GenerationStep>(0);
  readonly retryCount = signal(0);

  readonly canGenerate = computed(() => this.selectedIds().size > 0 && !this.isGenerating());

  readonly lengths: Array<{ value: StoryLength; label: string; badge?: string }> = [
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Medium' },
    { value: 'long', label: 'Long' },
    { value: 'very-long', label: 'Very Long' },
    { value: 'extra-long', label: 'Extra Long', badge: 'Podcast' },
  ];

  readonly isLongFormat = computed(() =>
    this.selectedLength() === 'very-long' || this.selectedLength() === 'extra-long'
  );

  readonly difficulties: { value: StoryDifficulty; label: string }[] = [
    { value: 'A1', label: 'A1' },
    { value: 'A2', label: 'A2' },
    { value: 'B1', label: 'B1' },
    { value: 'B2', label: 'B2' },
  ];

  readonly stepMessage = computed(() => [
    '',
    'Writing your story…',
    'Narrating the audio…',
    'Almost ready…',
  ][this.generationStep()]);

  readonly estimatedWait = computed(() =>
    this.isLongFormat() ? 'Usually 25–40 seconds' : 'Usually 10–20 seconds'
  );

  readonly showSupportLink = computed(() => this.retryCount() >= 3);

  private stepTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    addIcons({ sparklesOutline, closeOutline, checkmarkOutline, lockClosedOutline });
    // Free users can only generate short stories
    if (!this.subscriptionStore.isPro()) {
      this.selectedLength.set('short');
    }
  }

  ngOnDestroy(): void {
    this.clearStepTimers();
  }

  toggleCollection(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  selectedCount(): number {
    return this.selectedIds().size;
  }

  dismiss(): void {
    if (this.isGenerating()) return;
    void this.modalCtrl.dismiss(null);
  }

  async generate(): Promise<void> {
    if (!this.canGenerate()) return;
    this.storyStore.clearGenerateError();
    this.generationStep.set(0);
    this.startStepTimers();

    const dto: GenerateStoryDto = {
      collectionIds: Array.from(this.selectedIds()),
      length: this.selectedLength(),
      difficulty: this.selectedDifficulty(),
    };

    const story = await this.storyStore.generateStory(dto);
    this.clearStepTimers();
    this.generationStep.set(0);

    if (story) {
      void this.modalCtrl.dismiss({ story, generated: true });
    }
  }

  async retry(): Promise<void> {
    this.retryCount.update(n => n + 1);
    await this.generate();
  }

  private startStepTimers(): void {
    this.clearStepTimers();
    this.stepTimers = [
      setTimeout(() => { if (this.isGenerating()) this.generationStep.set(1); }, 1000),
      setTimeout(() => { if (this.isGenerating()) this.generationStep.set(2); }, 10000),
      setTimeout(() => { if (this.isGenerating()) this.generationStep.set(3); }, 22000),
    ];
  }

  private clearStepTimers(): void {
    this.stepTimers.forEach(t => clearTimeout(t));
    this.stepTimers = [];
  }
}
