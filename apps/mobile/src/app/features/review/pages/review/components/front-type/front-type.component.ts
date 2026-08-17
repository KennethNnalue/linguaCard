import { ChangeDetectionStrategy, Component, ElementRef, input, model, output, viewChild } from '@angular/core';
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
  private readonly answerInput = viewChild<ElementRef<HTMLInputElement>>('answerInput');
  readonly prompt = input.required<string>();
  readonly expectsGermanAnswer = input.required<boolean>();
  readonly compact = input(false);
  readonly typed = model<string>('');
  readonly check = output<void>();
  readonly dontKnow = output<void>();
  readonly focusChanged = output<boolean>();

  readonly accents = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] as const;

  constructor() {
    addIcons({ checkmarkOutline });
  }

  onInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.typed.set(event.target.value);
  }

  append(ch: string): void {
    const inputElement = this.answerInput()?.nativeElement;
    const currentValue = this.typed();
    const selectionStart = inputElement?.selectionStart ?? currentValue.length;
    const selectionEnd = inputElement?.selectionEnd ?? selectionStart;
    this.typed.set(`${currentValue.slice(0, selectionStart)}${ch}${currentValue.slice(selectionEnd)}`);
    queueMicrotask(() => {
      const input = this.answerInput()?.nativeElement;
      if (!input) return;
      const caretPosition = selectionStart + ch.length;
      input.focus({ preventScroll: true });
      input.setSelectionRange(caretPosition, caretPosition);
    });
  }

  preserveInputFocus(event: PointerEvent): void {
    event.preventDefault();
  }

  onEnter(event: Event): void {
    event.preventDefault();
    this.check.emit();
  }
}
