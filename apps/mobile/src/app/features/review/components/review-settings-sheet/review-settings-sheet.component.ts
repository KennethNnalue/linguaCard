import {ChangeDetectionStrategy, Component, Input, OnInit, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
  ModalController,
} from '@ionic/angular';
import {TranslatePipe} from '@ngx-translate/core';
import {addIcons} from 'ionicons';
import {closeOutline} from 'ionicons/icons';
import type {ReviewAutoplayMode} from '../../application/review-audio-policy';
import type {StudyMode} from '../../services/review-prefs.service';

export interface ReviewSettingsResult {
  mode: StudyMode;
  autoplay: ReviewAutoplayMode;
}

@Component({
  selector: 'lc-review-settings-sheet',
  templateUrl: './review-settings-sheet.component.html',
  styleUrls: ['./review-settings-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
    TranslatePipe,
  ],
})
export class ReviewSettingsSheetComponent implements OnInit {
  private readonly modalController = inject(ModalController);

  @Input() initialMode: StudyMode = 'type';
  @Input() initialAutoplay: ReviewAutoplayMode = 'answer_and_example';

  mode: StudyMode = 'type';
  autoplay: ReviewAutoplayMode = 'answer_and_example';

  constructor() {
    addIcons({closeOutline});
  }

  ngOnInit(): void {
    this.mode = this.initialMode;
    this.autoplay = this.initialAutoplay;
  }

  dismiss(): void {
    void this.modalController.dismiss(null, 'cancel');
  }

  save(): void {
    const result: ReviewSettingsResult = {mode: this.mode, autoplay: this.autoplay};
    void this.modalController.dismiss(result, 'save');
  }
}
