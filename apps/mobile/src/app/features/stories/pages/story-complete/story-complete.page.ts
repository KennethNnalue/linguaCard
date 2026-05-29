import { Component, inject, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  arrowBackOutline,
  playOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { Story } from '../../../../core/models/mock-data';
import { StoryStore } from '../../store/story.store';
import { StoryApiService } from '../../services/story-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-story-complete',
  templateUrl: './story-complete.page.html',
  styleUrls: ['./story-complete.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, NgClass],
})
export class StoryCompletePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);

  readonly story = signal<Story | null>(null);

  constructor() {
    addIcons({ checkmarkCircleOutline, arrowBackOutline, playOutline, sparklesOutline });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    let s = this.storyStore.getById(id);
    if (!s) {
      try {
        s = await firstValueFrom(this.api.getById(id));
      } catch {
        this.router.navigate(['/stories']);
        return;
      }
    }
    this.story.set(s);
  }

  goToLibrary(): void {
    this.router.navigate(['/stories']);
  }

  replayStory(): void {
    const s = this.story();
    if (s) this.router.navigate(['/stories', s.id]);
  }

  articleClass(article: string | null): string {
    if (article === 'der') return 'art-der';
    if (article === 'die') return 'art-die';
    if (article === 'das') return 'art-das';
    return '';
  }
}
