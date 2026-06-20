import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar, ToastController } from '@ionic/angular/standalone';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import type { CefrLevel, PlatformCollectionSummary } from '@lingua-card/shared/domain';
import { PlatformCollectionStore, ringStyle } from '../../store/platform-collection.store';
import { CollectionStore } from '../../store/collection.store';

@Component({
  selector: 'lc-explore-topic',
  templateUrl: './explore-topic.page.html',
  styleUrls: ['./explore-topic.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, TranslatePipe],
})
export class ExploreTopicPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly collectionStore = inject(CollectionStore);

  readonly topic = signal('');
  readonly adoptingId = this.platformStore.adoptingId;
  readonly selectedLevel = this.platformStore.selectedLevel;
  readonly suggestedLevel = this.platformStore.suggestedLevel;
  readonly levelCounts = this.platformStore.levelCounts;

  readonly topicCollections = computed((): PlatformCollectionSummary[] => {
    const t = this.topic();
    const level = this.platformStore.selectedLevel();
    return this.platformStore.collections().filter(c => {
      const topicMatch = c.topic === t;
      const levelMatch = level === 'all' || c.level === level;
      return topicMatch && levelMatch;
    });
  });

  readonly levelOptions = computed((): Array<{ value: CefrLevel | 'all'; label: string; count: number }> => {
    const counts = this.levelCounts();
    const suggested = this.suggestedLevel();
    const all = Object.values(counts).reduce((a, b) => a + b, 0);
    const levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
    return [
      { value: suggested, label: suggested, count: counts[suggested] },
      { value: 'all', label: 'All', count: all },
      ...levels.filter(l => l !== suggested && counts[l] > 0).map(l => ({ value: l as CefrLevel | 'all', label: l, count: counts[l] })),
    ];
  });

  setLevel(level: CefrLevel | 'all'): void {
    this.platformStore.setLevel(level);
  }

  readonly adoptedMasteryMap = computed((): Map<string, number> => {
    const map = new Map<string, number>();
    for (const col of this.collectionStore.collections()) {
      if (!col.cardCount) continue;
      map.set(col.id, Math.round((col.masteredCount / col.cardCount) * 100));
    }
    return map;
  });

  constructor() {
    addIcons({ chevronBackOutline });

    effect(() => {
      const ev = this.platformStore.lastAdoptEvent();
      if (!ev) return;
      if (ev.type === 'success') {
        const count = ev.result.addedCount;
        void this._toast(
          count > 0 ? this.translate.instant('exploreTopic.adopt.successMessage', { count }) : this.translate.instant('exploreTopic.adopt.alreadyInMessage'),
          'success',
        );
      } else {
        void this._toast(this.translate.instant('exploreTopic.adopt.errorMessage'), 'danger');
      }
    });
  }

  ngOnInit(): void {
    const topic = this.route.snapshot.paramMap.get('topic') ?? '';
    this.topic.set(decodeURIComponent(topic));
    this.platformStore.loadCollections();
  }

  goBack(): void {
    this.router.navigate(['/vault/collections'], { queryParams: { segment: 'explore' } });
  }

  openDetail(id: string): void {
    this.router.navigate(['/vault/collections/platform', id]);
  }

  openAdoptedCollection(collectionId: string): void {
    this.router.navigate(['/vault/collections', collectionId]);
  }

  adoptCollection(col: PlatformCollectionSummary): void {
    this.platformStore.adopt(col.id);
  }

  masteryPercent(adoptedCollectionId: string | null): number {
    if (!adoptedCollectionId) return 0;
    return this.adoptedMasteryMap().get(adoptedCollectionId) ?? 0;
  }

  readonly ringStyle = ringStyle;

  private async _toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 3500, color, position: 'bottom' });
    await t.present();
  }
}
