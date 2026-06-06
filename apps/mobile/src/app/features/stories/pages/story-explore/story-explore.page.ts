import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, bookOutline, chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import type { PlatformStoryCard, StoryCategory, StoryDifficulty } from '@lingua-card/shared/domain';
import { STORY_CATEGORIES } from '@lingua-card/shared/domain';
import { PlatformStoryApiService } from '../../services/platform-story-api.service';

const LEVEL_FILTERS: Array<{ value: StoryDifficulty | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
];

const PAGE_SIZE = 20;

@Component({
  selector: 'lc-story-explore',
  templateUrl: './story-explore.page.html',
  styleUrls: ['./story-explore.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent, IonHeader, IonToolbar, IonIcon,
    IonInfiniteScroll, IonInfiniteScrollContent,
  ],
})
export class StoryExplorePage implements OnInit {
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly api      = inject(PlatformStoryApiService);

  readonly levelFilters    = LEVEL_FILTERS;
  readonly categoryFilters = STORY_CATEGORIES;

  readonly selectedLevel    = signal<StoryDifficulty | null>(null);
  readonly selectedCategory = signal<StoryCategory | null>(null);

  readonly stories     = signal<PlatformStoryCard[]>([]);
  readonly isLoading   = signal(false);
  readonly hasMore     = signal(true);
  private offset       = 0;

  readonly pageTitle = computed(() => {
    const level    = this.selectedLevel();
    const category = this.selectedCategory();
    const catLabel = category
      ? (STORY_CATEGORIES.find(c => c.value === category)?.label ?? category)
      : null;

    if (catLabel && level) return `${catLabel} · ${level}`;
    if (catLabel)          return catLabel;
    if (level)             return `Level ${level}`;
    return 'All Stories';
  });

  constructor() {
    addIcons({ arrowBackOutline, bookOutline, chevronBackOutline, chevronForwardOutline });
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const level    = qp.get('level') as StoryDifficulty | null;
    const category = qp.get('category') as StoryCategory | null;
    if (level)    this.selectedLevel.set(level);
    if (category) this.selectedCategory.set(category);
    this.loadPage(true);
  }

  selectLevel(level: StoryDifficulty | null): void {
    const current = this.selectedLevel();
    this.selectedLevel.set(current === level ? null : level);
    this.loadPage(true);
  }

  selectCategory(cat: StoryCategory): void {
    const current = this.selectedCategory();
    this.selectedCategory.set(current === cat ? null : cat);
    this.loadPage(true);
  }

  openStory(id: string): void {
    this.router.navigate(['/stories/platform', id]);
  }

  goBack(): void {
    this.router.navigate(['/stories']);
  }

  onInfiniteScroll(event: Event): void {
    if (!this.hasMore()) {
      (event as CustomEvent).detail.complete();
      return;
    }
    this.loadPage(false, event);
  }

  categoryLabel(value: StoryCategory): string {
    return STORY_CATEGORIES.find(c => c.value === value)?.label ?? value;
  }

  categoryIcon(value: StoryCategory): string {
    return STORY_CATEGORIES.find(c => c.value === value)?.icon ?? '📖';
  }

  private loadPage(reset: boolean, infiniteEvent?: Event): void {
    if (reset) {
      this.offset = 0;
      this.stories.set([]);
      this.hasMore.set(true);
    }

    this.isLoading.set(true);
    const level    = this.selectedLevel() ?? undefined;
    const category = this.selectedCategory() ?? undefined;

    this.api.getAll({ level, category, limit: PAGE_SIZE, offset: this.offset }).subscribe({
      next: res => {
        this.stories.update(prev => [...prev, ...res.stories]);
        this.offset += res.stories.length;
        this.hasMore.set(this.offset < res.total);
        this.isLoading.set(false);
        if (infiniteEvent) (infiniteEvent as CustomEvent).detail.complete();
      },
      error: () => {
        this.isLoading.set(false);
        if (infiniteEvent) (infiniteEvent as CustomEvent).detail.complete();
      },
    });
  }
}
