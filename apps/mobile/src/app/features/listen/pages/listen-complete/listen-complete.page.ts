import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { ListenStore } from '../../store/listen.store';

@Component({
  selector: 'lc-listen-complete',
  templateUrl: './listen-complete.page.html',
  styleUrls: ['./listen-complete.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonHeader, IonToolbar],
})
export class ListenCompletePage implements OnInit {
  private readonly listenStore = inject(ListenStore);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  readonly queueCount = computed(() => this.listenStore.queue().length);
  readonly playMode = this.listenStore.playMode;
  readonly speed = this.listenStore.speed;

  readonly sessionStart = signal(Date.now());
  readonly elapsedMinutes = computed(() => {
    return Math.max(1, Math.round((Date.now() - this.sessionStart()) / 60000));
  });

  readonly playModeLabel = computed(() => {
    const map: Record<string, string> = {
      compact: 'Compact mode',
      examples: 'Examples mode',
      deepDive: 'Deep Dive mode',
    };
    return map[this.playMode()] ?? 'Examples mode';
  });

  ngOnInit(): void {
    this.sessionStart.set(Date.now());
  }

  listenAgain(): void {
    this.listenStore.restartWithShuffle();
    this.router.navigate(['/listen/now-playing'], { replaceUrl: true });
  }

  goBack(): void {
    // Reset status so ListenPage / NowPlayingPage start fresh
    this.listenStore.resetToIdle();
    this.navCtrl.navigateBack(['/listen']);
  }
}
