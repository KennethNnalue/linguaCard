import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { IonContent, IonSpinner, ModalController } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import type { CefrLevel, OnboardingLevel, PlatformCollectionSummary } from '@lingua-card/shared/domain';
import { OnboardingShellComponent } from '../../components/onboarding-shell/onboarding-shell.component';
import { OnboardingStore } from '../../store/onboarding.store';
import { PlatformCollectionStore } from '../../../vault/store/platform-collection.store';
import { AddWordSheetComponent } from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import { ImportPage } from '../../../vault/pages/import/import.page';
import { CardStore } from '../../../vault/store/card.store';

const LEVEL_TO_CEFR: Record<OnboardingLevel, CefrLevel> = {
  beginner: 'A1',
  some: 'A2',
  intermediate: 'B1',
};

@Component({
  selector: 'lc-seed',
  templateUrl: './seed.page.html',
  styleUrls: ['./seed.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonSpinner, TranslatePipe, OnboardingShellComponent],
})
export class SeedPage {
  readonly store = inject(OnboardingStore);
  private readonly platformStore = inject(PlatformCollectionStore);
  private readonly cardStore = inject(CardStore);
  private readonly modalCtrl = inject(ModalController);
  readonly collection = computed(() => this.store.recommendedCollection());
  readonly isSeeding = computed(() => this.store.isSeeding());
  readonly seedError = computed(() => this.store.seedError());
  readonly seededCount = computed(() => this.store.seededCount());

  constructor() {
    this.platformStore.loadCollections();

    effect(() => {
      const collections = this.platformStore.collections();
      if (collections.length > 0 && !this.store.recommendedCollection() && this.store.seededCount() === 0) {
        this.pickRecommendedCollection(collections);
      }
    });
  }

  private pickRecommendedCollection(collections: PlatformCollectionSummary[]): void {
    const notAdopted = collections.filter(c => c.adoptionStatus === 'not-adopted');
    if (notAdopted.length === 0) return;

    const level = this.store.level();
    const targetCefr = level ? LEVEL_TO_CEFR[level] : 'A1';
    const matchingLevel = notAdopted.filter(c => c.level === targetCefr);
    const pick = matchingLevel.length > 0 ? matchingLevel[0] : notAdopted[0];
    this.store.setRecommendedCollection(pick);
  }

  async onAdopt(): Promise<void> {
    const c = this.collection();
    if (!c) return;
    await this.store.adoptCollection(c.id);
  }

  async onAddOwn(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async onImport(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ImportPage,
      componentProps: { isModal: true },
    });
    await modal.present();
  }

  onNext(): void {
    this.store.next();
  }

  onBack(): void {
    this.store.back();
  }

  onSkip(): void {
    this.store.skip();
  }
}
