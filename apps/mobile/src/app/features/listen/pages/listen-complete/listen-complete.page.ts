import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonToolbar, ViewWillEnter } from '@ionic/angular/standalone';
import { ListenStore } from '../../store/listen.store';
import { MIN_ESTIMATED_MINUTES, PlayModeLabel } from '../../models/listen.models';

@Component({
  selector: 'lc-listen-complete',
  templateUrl: './listen-complete.page.html',
  styleUrl: './listen-complete.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar],
})
export class ListenCompletePage implements ViewWillEnter {
  protected readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  readonly queueCount = computed(() => this.listenStore.queue().length);

  // C4 fix: store the elapsed value as a snapshot signal, not a live Date.now() computation.
  // ionViewWillEnter fires when the session genuinely just ended, giving us the elapsed time
  // for that session — not a perpetually-stale computed.
  private readonly _sessionEnteredAt = signal(Date.now());
  readonly elapsedMinutes = signal(MIN_ESTIMATED_MINUTES);

  readonly playModeLabel = computed(() =>
    PlayModeLabel[this.listenStore.playMode()] ?? PlayModeLabel.examples
  );

  ionViewWillEnter(): void {
    const now = Date.now();
    const elapsed = Math.max(MIN_ESTIMATED_MINUTES, Math.round((now - this._sessionEnteredAt()) / 60000));
    this.elapsedMinutes.set(elapsed);
    this._sessionEnteredAt.set(now);
  }

  listenAgain(): void {
    this.listenStore.restartWithShuffle();
    this.router.navigate(['/listen/now-playing'], { replaceUrl: true });
  }

  goBack(): void {
    this.listenStore.resetToIdle();
    this.navCtrl.navigateBack(['/listen']);
  }
}
