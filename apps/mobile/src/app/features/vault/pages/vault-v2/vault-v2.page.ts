import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import type { CefrLevel, CollectionSummaryView, PlatformCollectionSummary } from '@lingua-card/shared/domain';
import { CollectionCoverComponent } from '../../components/collection-cover/collection-cover.component';
import { PlatformCollectionStore } from '../../store/platform-collection.store';
import { VaultV2Store } from '../../store/vault-v2.store';
import { EngagementStore } from '../../../engagement/state/engagement.store';
import { ReviewPlayerService } from '../../../review/services/review-player.service';
import { SettingsStore } from '../../../settings/store/settings.store';

type LevelFilter = CefrLevel | 'all';

@Component({
  selector: 'lc-vault-v2',
  templateUrl: './vault-v2.page.html',
  styleUrls: ['./vault-v2.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonRefresher, IonRefresherContent, CollectionCoverComponent],
})
export class VaultV2Page implements OnInit {
  readonly store = inject(VaultV2Store);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly engagementStore = inject(EngagementStore);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly router = inject(Router);

  readonly query = signal('');
  readonly selectedLevel = signal<LevelFilter>('all');
  readonly selectedTopic = signal<string | null>(null);
  readonly showAllPlatform = signal(false);
  readonly showAllPersonal = signal(false);
  readonly searchOpen = signal(false);
  readonly wordsOpen = signal(false);
  readonly vault = this.store.vault;
  readonly dayStreak = this.engagementStore.dayStreak;
  readonly levelFilters: readonly LevelFilter[] = ['all', 'A1', 'A2', 'B1', 'B2'];

  readonly languagePair = computed(() => {
    const context = this.vault()?.learningContext;
    if (!context) return '';
    return `${this.languageName(context.sourceLanguage)} → ${this.languageName(context.targetLanguage)}`;
  });

  readonly topics = computed(() => {
    const values = new Set(this.platformStore.collections().map(item => item.topic));
    return [...values].sort();
  });

  readonly platformCollections = computed(() => {
    const search = this.normalizedQuery();
    const level = this.selectedLevel();
    const topic = this.selectedTopic();
    const results = this.platformStore.collections().filter(item =>
      (level === 'all' || item.level === level)
      && (!topic || item.topic === topic)
      && (!search || item.title.toLocaleLowerCase().includes(search)),
    );
    return this.showAllPlatform() ? results : results.slice(0, 3);
  });

  readonly personalCollections = computed(() => {
    const search = this.normalizedQuery();
    const level = this.selectedLevel();
    const results = (this.vault()?.collections ?? []).filter(item =>
      (level === 'all' || item.level === level)
      && (!search || item.name.toLocaleLowerCase().includes(search)),
    );
    return this.showAllPersonal() ? results : results.slice(0, 4);
  });

  readonly filteredWords = computed(() => {
    const search = this.normalizedQuery();
    const items = this.store.learningItems();
    return search
      ? items.filter(item => item.lexeme.text.toLocaleLowerCase().includes(search)
          || item.localization.translation.toLocaleLowerCase().includes(search))
      : items;
  });

  readonly stageDistribution = computed(() => {
    const items = this.store.learningItems();
    const total = Math.max(items.length, 1);
    const stages = ['new', 'learning', 'familiar', 'strong', 'mastered'] as const;
    return stages.map(stage => ({
      stage,
      width: (items.filter(item => item.reviewState.stage === stage).length / total) * 100,
    }));
  });

  ngOnInit(): void {
    this.store.ensureActiveVault();
    void this.engagementStore.loadEngagement();
    if (!this.platformStore.hasEverLoaded()) this.platformStore.loadCollections();
  }

  updateQuery(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.query.set(target.value);
  }

  setLevel(level: LevelFilter): void {
    this.selectedLevel.set(level);
    this.showAllPlatform.set(false);
    this.showAllPersonal.set(false);
  }

  setTopic(topic: string | null): void {
    this.selectedTopic.set(topic);
    this.showAllPlatform.set(false);
  }

  startReview(): void {
    void this.reviewPlayer.openSource({ kind: 'daily' }, this.settingsStore.dailyGoal());
  }

  startListen(): void {
    void this.router.navigateByUrl('/listen');
  }

  openCollection(collection: CollectionSummaryView): void {
    void this.router.navigate(['/vault/collections', collection.id]);
  }

  reviewCollection(collectionId: string): void {
    void this.reviewPlayer.openSource(
      { kind: 'collection', collectionId },
      this.settingsStore.dailyGoal(),
    );
  }

  openPlatformCollection(collection: PlatformCollectionSummary): void {
    void this.router.navigate(['/vault/collections/platform', collection.id]);
  }

  openWord(itemId: string): void {
    void this.router.navigate(['/vault', itemId]);
  }

  async refresh(event: CustomEvent): Promise<void> {
    this.store.loadActiveVault();
    this.platformStore.loadCollections();
    const target = event.target;
    if (target && typeof target === 'object' && 'complete' in target && typeof target.complete === 'function') {
      await new Promise(resolve => setTimeout(resolve, 400));
      target.complete();
    }
  }

  collectionMeta(collection: CollectionSummaryView): string {
    return collection.dueCount > 0
      ? `${collection.itemCount} words · ${collection.dueCount} due`
      : `${collection.itemCount} words · all caught up`;
  }

  platformMeta(collection: PlatformCollectionSummary): string {
    return `${collection.wordCount} words · ${collection.topic}`;
  }

  private normalizedQuery(): string {
    return this.query().trim().toLocaleLowerCase();
  }

  private languageName(code: string): string {
    const names: Record<string, string> = { en: 'English', de: 'German', ar: 'Arabic', es: 'Spanish' };
    return names[code] ?? code;
  }
}
