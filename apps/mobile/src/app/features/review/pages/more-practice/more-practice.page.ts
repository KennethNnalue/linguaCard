import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonToolbar} from '@ionic/angular';
import {TranslatePipe} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  documentTextOutline,
  flameOutline,
  optionsOutline,
  refreshOutline,
} from 'ionicons/icons';
import {CardStore} from '../../../vault/store/card.store';
import {SettingsStore} from '../../../settings/store/settings.store';
import {ReviewRoute} from '../../models/review.model';
import {LeechService} from '../../services/leech.service';
import {ReviewPlayerService} from '../../services/review-player.service';

@Component({
  selector: 'lc-more-practice',
  templateUrl: './more-practice.page.html',
  styleUrls: ['./more-practice.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonToolbar, TranslatePipe],
})
export class MorePracticePage {
  private readonly cards = inject(CardStore);
  private readonly leeches = inject(LeechService);
  private readonly settings = inject(SettingsStore);
  private readonly reviewPlayer = inject(ReviewPlayerService);
  private readonly router = inject(Router);

  readonly newCount = this.cards.newCount;
  readonly strugglingCount = this.cards.strugglingCount;
  readonly leechCount = this.leeches.leechCount;
  readonly launching = this.reviewPlayer.isLaunching;

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronForwardOutline,
      documentTextOutline,
      flameOutline,
      optionsOutline,
      refreshOutline,
    });
  }

  ionViewWillEnter(): void {
    void this.cards.loadCards();
  }

  back(): void {
    void this.router.navigate([ReviewRoute.HUB]);
  }

  startNewWords(): void {
    if (this.newCount() === 0 || this.launching()) return;
    void this.reviewPlayer.openSource({kind: 'new-only'}, this.settings.dailyGoal());
  }

  openStruggling(): void {
    void this.router.navigate([ReviewRoute.STRUGGLING]);
  }

  openLeeches(): void {
    void this.router.navigate([ReviewRoute.LEECHES]);
  }

  openCustom(): void {
    void this.router.navigate([ReviewRoute.CUSTOM]);
  }
}
