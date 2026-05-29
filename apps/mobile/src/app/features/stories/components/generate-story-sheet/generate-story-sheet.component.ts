import { Component, inject, signal, computed } from '@angular/core';
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
import { sparklesOutline, closeOutline, checkmarkOutline } from 'ionicons/icons';
import { Collection, GenerateStoryDto, StoryDifficulty, StoryLength } from '../../../../core/models/mock-data';
import { CollectionStore } from '../../../vault/store/collection.store';
import { StoryStore } from '../../store/story.store';

@Component({
  selector: 'app-generate-story-sheet',
  templateUrl: './generate-story-sheet.component.html',
  styleUrls: ['./generate-story-sheet.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, IonSpinner, NgClass],
})
export class GenerateStorySheetComponent {
  private readonly collectionStore = inject(CollectionStore);
  private readonly storyStore = inject(StoryStore);
  private readonly modalCtrl = inject(ModalController);

  readonly collections = this.collectionStore.collections;
  readonly isGenerating = this.storyStore.isGenerating;
  readonly generateError = this.storyStore.generateError;

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedLength = signal<StoryLength>('medium');
  readonly selectedDifficulty = signal<StoryDifficulty>('B1');

  readonly canGenerate = computed(() => this.selectedIds().size > 0 && !this.isGenerating());

  readonly lengths: { value: StoryLength; label: string }[] = [
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Medium' },
    { value: 'long', label: 'Long' },
  ];

  readonly difficulties: { value: StoryDifficulty; label: string }[] = [
    { value: 'A2', label: 'A2' },
    { value: 'B1', label: 'B1' },
    { value: 'B2', label: 'B2' },
  ];

  constructor() {
    addIcons({ sparklesOutline, closeOutline, checkmarkOutline });
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
    void this.modalCtrl.dismiss(null);
  }

  async generate(): Promise<void> {
    if (!this.canGenerate()) return;
    this.storyStore.clearGenerateError();

    const dto: GenerateStoryDto = {
      collectionIds: Array.from(this.selectedIds()),
      length: this.selectedLength(),
      difficulty: this.selectedDifficulty(),
    };

    const story = await this.storyStore.generateStory(dto);
    if (story) {
      void this.modalCtrl.dismiss({ story });
    }
  }
}
