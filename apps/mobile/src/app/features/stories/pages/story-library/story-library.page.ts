import { Component, inject, OnInit } from '@angular/core';
import { NgClass, TitleCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  AlertController,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  addOutline,
  playOutline,
  timeOutline,
  sparklesOutline,
  trashOutline,
  chevronDownCircleOutline,
} from 'ionicons/icons';
import type { Story } from '@lingua-card/shared/domain';
import { StoryStore } from '../../store/story.store';
import { SyncService } from '../../../../core/services/sync.service';
import { GenerateStorySheetComponent } from '../../components/generate-story-sheet/generate-story-sheet.component';

@Component({
  selector: 'app-story-library',
  templateUrl: './story-library.page.html',
  styleUrls: ['./story-library.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, IonRefresher, IonRefresherContent, NgClass, TitleCasePipe],
})
export class StoryLibraryPage implements OnInit {
  private readonly storyStore = inject(StoryStore);
  private readonly syncService = inject(SyncService);
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);

  readonly stories = this.storyStore.sortedStories;
  readonly isLoading = this.storyStore.isLoading;
  readonly isRefreshing = this.storyStore.isRefreshing;
  readonly isGenerating = this.storyStore.isGenerating;

  constructor() {
    addIcons({ bookOutline, addOutline, playOutline, timeOutline, sparklesOutline, trashOutline, chevronDownCircleOutline });
  }

  ngOnInit(): void {
    this.storyStore.loadStories();
  }

  async onRefresh(event: Event): Promise<void> {
    if (!navigator.onLine) {
      setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
      return;
    }
    await this.syncService.forceSync();
    (event.target as HTMLIonRefresherElement).complete();
  }

  async openGenerateSheet(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: GenerateStorySheetComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handle: true,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<{ story: Story }>();
    if (data?.story) {
      this.router.navigate(['/stories', data.story.id]);
    }
  }

  openStory(event: Event | null, story: Story): void {
    event?.stopPropagation();
    this.router.navigate(['/stories', story.id]);
  }

  listenStory(event: Event, story: Story): void {
    event.stopPropagation();
    this.router.navigate(['/stories', story.id], { queryParams: { autoPlay: '1' } });
  }

  readingTime(story: Story): string {
    const mins = Math.max(1, Math.ceil(story.audioDurationMs / 60000));
    return `${mins} min`;
  }

  levelStyle(level: string): { background: string; color: string } {
    const map: Record<string, { background: string; color: string }> = {
      A2: { background: '#D1FAE5', color: '#059669' },
      B1: { background: '#FEF3C7', color: '#D97706' },
      B2: { background: '#EAF2FC', color: '#1A56A3' },
    };
    return map[level] ?? { background: '#F1EFE8', color: '#5F5E5A' };
  }

  articleClass(article: string | null): string {
    if (article === 'der') return 'art-der';
    if (article === 'die') return 'art-die';
    if (article === 'das') return 'art-das';
    return '';
  }

  async confirmDelete(event: Event, story: Story): Promise<void> {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Delete story',
      message: `Remove "${story.title}"? The audio will also be deleted.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => this.storyStore.deleteStory(story.id),
        },
      ],
    });
    await alert.present();
  }
}
