import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { ListenStore } from '../../store/listen.store';
import { MIN_ESTIMATED_MINUTES, PlayModeLabelKey } from '../../models/listen.models';

@Component({
  selector: 'lc-listen-complete',
  templateUrl: './listen-complete.page.html',
  styleUrl: './listen-complete.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar, TranslatePipe],
})
export class ListenCompletePage {
  protected readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  readonly queueCount = computed(() => this.listenStore.queue().length);

  /** Real session duration, derived from the start timestamp stamped by the store.
   *  Snapshotted on first read (when this page renders, i.e. just after the
   *  session ended) — not a perpetually-live clock. */
  readonly elapsedMinutes = computed(() => {
    const start = this.listenStore.sessionStartedAt();
    if (!start) return MIN_ESTIMATED_MINUTES;
    return Math.max(MIN_ESTIMATED_MINUTES, Math.round((Date.now() - start) / 60000));
  });

  readonly playModeLabelKey = computed(
    () => PlayModeLabelKey[this.listenStore.playMode()] ?? PlayModeLabelKey.wordsWithExamples,
  );

  listenAgain(): void {
    this.listenStore.restartWithShuffle();
    this.router.navigate(['/listen/now-playing'], { replaceUrl: true });
  }

  goBack(): void {
    this.listenStore.resetToIdle();
    this.navCtrl.navigateBack(['/listen']);
  }
}
