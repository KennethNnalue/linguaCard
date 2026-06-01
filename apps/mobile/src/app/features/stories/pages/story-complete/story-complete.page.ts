import {Component, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {IonContent, IonHeader, IonIcon, IonToolbar,} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {arrowBackOutline, checkmarkCircleOutline, playOutline, sparklesOutline,} from 'ionicons/icons';
import {Story} from '@lingua-card/shared/domain';
import {StoryStore} from '../../store/story.store';
import {StoryApiService} from '../../services/story-api.service';
import {firstValueFrom} from 'rxjs';
import {ArticleBadgeComponent} from '../../../../shared/components/article-badge/article-badge.component';

@Component({
  selector: 'lc-story-complete',
  templateUrl: './story-complete.page.html',
  styleUrls: ['./story-complete.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, ArticleBadgeComponent],
})
export class StoryCompletePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storyStore = inject(StoryStore);
  private readonly api = inject(StoryApiService);

  readonly story = signal<Story | null>(null);

  constructor() {
    addIcons({checkmarkCircleOutline, arrowBackOutline, playOutline, sparklesOutline});
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
}
