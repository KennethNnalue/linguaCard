import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { canSubmitRecallAnswer, insertRecallCharacter } from '../../../../application/recall-answer';
import { ButtonComponent } from '../../../../../../shared/ui/button/button.component';

@Component({
  selector: 'lc-rv-front-type',
  templateUrl: './front-type.component.html',
  styleUrls: ['./front-type.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, TranslatePipe, ButtonComponent],
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

  readonly accents = ['ä', 'ö', 'ü', 'ß'] as const;

  constructor() {
    addIcons({ checkmarkOutline });
    afterNextRender(() => {
      // Route transitions can finish after the first render on iOS. Focusing on
      // the next frame keeps typing sessions keyboard-first without a flash of
      // the expanded pre-keyboard layout.
      requestAnimationFrame(() => this.focusInput());
    });
  }

  focusInput(): void {
    this.answerInput()?.nativeElement.focus({ preventScroll: true });
  }

  canSubmit(): boolean {
    return canSubmitRecallAnswer(this.typed());
  }

  onInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.typed.set(event.target.value);
  }

  append(ch: string): void {
    const inputElement = this.answerInput()?.nativeElement;
    const currentValue = this.typed();
    const selectionStart = inputElement?.selectionStart ?? currentValue.length;
    const selectionEnd = inputElement?.selectionEnd ?? selectionStart;
    const inserted = insertRecallCharacter(currentValue, ch, { start: selectionStart, end: selectionEnd });
    this.typed.set(inserted.answer);
    queueMicrotask(() => {
      const input = this.answerInput()?.nativeElement;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(inserted.caret, inserted.caret);
    });
  }

  preserveInputFocus(event: PointerEvent): void {
    event.preventDefault();
  }

  onEnter(event: Event): void {
    event.preventDefault();
    if (this.canSubmit()) this.check.emit();
  }
}
