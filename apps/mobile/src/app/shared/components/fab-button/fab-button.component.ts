import {Component, output} from '@angular/core';
import {IonButton, IonIcon} from "@ionic/angular/standalone";
import {addIcons} from "ionicons";
import {addOutline} from "ionicons/icons";

@Component({
  selector: 'lc-fab-button',
  templateUrl: './fab-button.component.html',
  styleUrls: ['./fab-button.component.scss'],
  imports: [
    IonButton,
    IonIcon
  ]
})
export class FabButtonComponent {

  clickButton = output<void>()

  constructor() {
    addIcons({
      addOutline
    });
  }


}
