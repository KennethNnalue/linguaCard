import {ChangeDetectionStrategy, Component, input} from '@angular/core';

export type ButtonVariant =
  | 'filled-primary'
  | 'filled-accent'
  | 'filled-inverse'
  | 'outline-primary'
  | 'ghost-primary'
  | 'review-primary'
  | 'review-ghost'
  | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'lc-button',
  standalone: true,
  imports: [],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('filled-primary');
  size = input<ButtonSize>('md');
  disabled = input(false);
  loading = input(false);
  fullWidth = input(false);
}
