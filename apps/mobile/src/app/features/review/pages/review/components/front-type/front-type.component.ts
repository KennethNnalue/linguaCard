import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'lc-rv-front-type',
  templateUrl: './front-type.component.html',
  styleUrls: ['./front-type.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe],
})
export class FrontTypeComponent {
  readonly prompt = input.required<string>();
  readonly typed = model<string>('');
  readonly check = output<void>();

  /** German accent keys — the #1 typing friction point. */
  readonly accents = ['ä', 'ö', 'ü', 'ß'];

  constructor() {
    addIcons({ checkmarkOutline });
  }

  onInput(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  append(ch: string): void {
    this.typed.update(v => v + ch);
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.check.emit();
  }
}
