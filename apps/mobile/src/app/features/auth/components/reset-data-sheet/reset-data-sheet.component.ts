import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonIcon,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import { alertCircleOutline, trashOutline } from 'ionicons/icons';
import { AuthService } from '../../../../core/services/auth.service';
import { CardApiService } from '../../../vault/services/card-api.service';
import { CollectionApiService } from '../../../vault/services/collection-api.service';
import { LocalDataService } from '../../../../core/services/local-data.service';
import { CardStore } from '../../../vault/store/card.store';
import { CollectionStore } from '../../../vault/store/collection.store';

@Component({
  selector: 'lc-reset-data-sheet',
  standalone: true,
  templateUrl: './reset-data-sheet.component.html',
  styleUrls: ['./reset-data-sheet.component.scss'],
  imports: [IonContent, IonIcon, FormsModule],
})
export class ResetDataSheetComponent {
  private readonly auth = inject(AuthService);
  private readonly cardApi = inject(CardApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly localData = inject(LocalDataService);
  private readonly cardStore = inject(CardStore);
  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  readonly password = signal('');
  readonly loading = signal(false);
  readonly passwordError = signal('');

  readonly wordCount = this.cardStore.totalCount;
  readonly collectionCount = computed(() => this.collectionStore.collections().length);

  get canSubmit(): boolean {
    return this.password().trim().length > 0 && !this.loading();
  }

  constructor() {
    addIcons({ trashOutline, alertCircleOutline });
  }

  async confirm(): Promise<void> {
    if (!this.canSubmit) return;

    this.loading.set(true);
    this.passwordError.set('');

    const valid = await firstValueFrom(this.auth.verifyPassword(this.password()));

    if (!valid) {
      this.loading.set(false);
      this.passwordError.set('Incorrect password. Please try again.');
      return;
    }

    try {
      await firstValueFrom(this.cardApi.removeAll());
      await firstValueFrom(this.collectionApi.removeAll());

      const userId = this.auth.currentUser()?.id;
      if (userId) await this.localData.clearAllUserData(userId);

      this.cardStore.reset();
      this.collectionStore.reset();

      await this.modalCtrl.dismiss({ reset: true });

      const toast = await this.toastCtrl.create({
        message: '✓ All data has been reset. Start fresh!',
        duration: 3000,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch {
      this.loading.set(false);
      this.passwordError.set('Something went wrong. Please try again.');
    }
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
