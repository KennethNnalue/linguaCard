import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, flashOutline, refreshOutline, moonOutline } from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';
import { SessionDatePipe } from '../../shared/pipes/session-date.pipe';
import { LeechEntry, LeechService } from '../../services/leech.service';
import { ReviewPrefsService } from '../../services/review-prefs.service';
import { ReviewStore } from '../../store/review.store';
import { ReviewRoute } from '../../models/review.model';

const TOAST_MS = 1700;

@Component({
  selector: 'lc-leeches',
  templateUrl: './leeches.page.html',
  styleUrls: ['./leeches.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, IonIcon, ArticleBadgeComponent, SessionDatePipe, TranslatePipe],
})
export class LeechesPage {
  private readonly leech = inject(LeechService);
  private readonly prefs = inject(ReviewPrefsService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly router = inject(Router);
  private readonly toast = inject(AppNotificationService);
  private readonly translate = inject(TranslateService);
  private readonly alerts = inject(AlertController);

  readonly leeches = this.leech.leeches;
  readonly leechCount = this.leech.leechCount;

  constructor() {
    addIcons({ chevronBackOutline, flashOutline, refreshOutline, moonOutline });
  }

  back(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }

  async reset(entry: LeechEntry): Promise<void> {
    const alert = await this.alerts.create({
      header: this.translate.instant('review.leeches.resetConfirmTitle'),
      message: this.translate.instant('review.leeches.resetConfirmMessage'),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('review.leeches.reset'),
          role: 'destructive',
          handler: () => { void this.executeReset(entry); },
        },
      ],
    });
    await alert.present();
  }

  async rest(entry: LeechEntry): Promise<void> {
    try {
      await this.leech.rest(entry.card);
      await this.showToast('review.leeches.restToast', { word: entry.card.content.back });
    } catch {
      await this.showToast('review.leeches.commandFailed');
    }
  }

  private async executeReset(entry: LeechEntry): Promise<void> {
    try {
      await this.leech.reset(entry.card);
      await this.showToast('review.leeches.resetToast', { word: entry.card.content.back });
    } catch {
      await this.showToast('review.leeches.commandFailed');
    }
  }

  breakThrough(): void {
    const queue = this.leech.breakthroughQueue();
    if (!queue.length) return;
    this.prefs.setMode('type');
    void this.reviewStore.startSession(
      { kind: 'explicit', cardIds: queue.map(card => card.id) },
      queue.length,
    ).then(result => {
      if (result.kind === 'started') void this.router.navigate([ReviewRoute.PLAYER]);
    });
  }

  private async showToast(key: string, params?: Record<string, unknown>): Promise<void> {
    const toast = await this.toast.create({
      message: this.translate.instant(key, params),
      duration: TOAST_MS,
      position: 'bottom',
      cssClass: 'rv-toast',
    });
    await toast.present();
  }
}
