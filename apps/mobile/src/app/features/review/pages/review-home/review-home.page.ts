import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {NavigationStart, Router, RouterLink} from '@angular/router';
import {
  IonContent,
  IonButton,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonPopover,
  IonRefresher,
  IonRefresherContent,
  IonProgressBar,
  IonSpinner,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import {TranslatePipe} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  addCircleOutline,
  arrowForwardOutline,
  bookOutline,
  checkmarkOutline,
  chevronForwardOutline,
  copyOutline,
  documentOutline,
  ellipsisHorizontalCircleOutline,
  flameOutline,
  notificationsOutline,
  refreshOutline,
  reorderTwoOutline,
  settingsOutline,
  statsChartOutline,
} from 'ionicons/icons';
import {filter} from 'rxjs';
import {AuthService} from '../../../../core/services/auth.service';
import {UserMenuComponent} from '../../../../shared/components/user-menu/user-menu.component';
import {ResetDataSheetComponent} from '../../../auth/components/reset-data-sheet/reset-data-sheet.component';
import {ShareStore} from '../../../sharing/store/share.store';
import {AddWordSheetComponent} from '../../../vault/components/add-word-sheet/add-word-sheet.component';
import {
  ReviewSettingsSheetComponent,
  type ReviewSettingsResult,
} from '../../components/review-settings-sheet/review-settings-sheet.component';
import {ReviewRoute} from '../../models/review.model';
import {ReviewPlayerService} from '../../services/review-player.service';
import {ReviewPrefsService} from '../../services/review-prefs.service';
import {ReviewHomeStore, type ReviewHomeViewModel} from '../../store/review-home.store';

@Component({
  selector: 'lc-review-home',
  templateUrl: './review-home.page.html',
  styleUrls: [
    './review-home.page.scss',
    './review-home-empty.page.scss',
    './review-home-header.page.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ReviewHomeStore],
  imports: [
    RouterLink,
    IonButton,
    IonContent,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonPopover,
    IonRefresher,
    IonRefresherContent,
    IonProgressBar,
    IonSpinner,
    IonToolbar,
    TranslatePipe,
    UserMenuComponent,
  ],
})
export class ReviewHomePage {
  readonly store = inject(ReviewHomeStore);
  readonly reviewLaunching = inject(ReviewPlayerService).isLaunching;
  readonly user = inject(AuthService).currentUser;
  readonly shareStore = inject(ShareStore);
  readonly menuOpen = signal(false);
  readonly menuEvent = signal<Event | undefined>(undefined);

  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);

  constructor() {
    addIcons({
      addCircleOutline,
      arrowForwardOutline,
      bookOutline,
      checkmarkOutline,
      chevronForwardOutline,
      copyOutline,
      documentOutline,
      ellipsisHorizontalCircleOutline,
      flameOutline,
      notificationsOutline,
      refreshOutline,
      reorderTwoOutline,
      settingsOutline,
      statsChartOutline,
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationStart),
      takeUntilDestroyed(),
    ).subscribe(() => this.closeMenu());
  }

  ionViewWillEnter(): void {
    void this.store.refresh();
  }

  ionViewWillLeave(): void {
    this.closeMenu();
  }

  async performPrimaryAction(viewModel: ReviewHomeViewModel): Promise<void> {
    if (viewModel.kind === 'ready') {
      await this.reviewPlayer.openPlanned(viewModel.plan.cardIds, {kind: 'daily'});
      await this.store.refresh();
      return;
    }
    if (viewModel.kind === 'resume') {
      await this.reviewPlayer.resume(viewModel.sessionId);
      await this.store.refresh();
      return;
    }
    if (viewModel.kind === 'empty' || viewModel.kind === 'nothing-eligible') {
      await this.openAddWord();
      return;
    }
    if (viewModel.kind === 'error') await this.store.refresh();
  }

  async openReviewSettings(): Promise<void> {
    const modal = await this.modalController.create({
      component: ReviewSettingsSheetComponent,
      componentProps: {
        initialMode: this.prefs.mode(),
        initialAutoplay: this.prefs.autoplay(),
      },
      cssClass: 'lc-review-settings-modal',
      breakpoints: [0, 0.72, 0.92],
      initialBreakpoint: 0.72,
      handle: false,
    });
    await modal.present();
    const result = await modal.onWillDismiss<ReviewSettingsResult>();
    if (result.role !== 'save' || !result.data) return;
    this.prefs.setMode(result.data.mode);
    this.prefs.setAutoplay(result.data.autoplay);
    await this.store.refresh();
  }

  async openAddWord(): Promise<void> {
    const modal = await this.modalController.create({
      component: AddWordSheetComponent,
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 1,
      handleBehavior: 'cycle',
    });
    await modal.present();
    const result = await modal.onWillDismiss<{created?: boolean}>();
    if (result.data?.created) await this.store.refresh();
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuEvent.set(event);
    this.menuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  openMorePractice(): void {
    void this.router.navigate(['/review/more']);
  }

  openProgress(): void {
    void this.router.navigate([ReviewRoute.PROGRESS]);
  }

  async openResetSheet(): Promise<void> {
    const modal = await this.modalController.create({
      component: ResetDataSheetComponent,
      breakpoints: [0, 0.65, 0.85],
      initialBreakpoint: 0.65,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async openDeleteAccountSheet(): Promise<void> {
    const modal = await this.modalController.create({
      component: ResetDataSheetComponent,
      componentProps: {mode: 'account'},
      breakpoints: [0, 0.7, 0.9],
      initialBreakpoint: 0.7,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  handleRefresh(event: Event): void {
    void this.store.refresh().finally(() => {
      void (event.target as HTMLIonRefresherElement).complete();
    });
  }

  preferenceLabel(viewModel: Extract<ReviewHomeViewModel, {kind: 'ready' | 'resume'}>): string {
    const mode = viewModel.preferences.mode === 'type' ? 'review.mode.type' : 'review.mode.flip';
    return `${mode}|review.audioAutoplay.${viewModel.preferences.autoplay}`;
  }
}
