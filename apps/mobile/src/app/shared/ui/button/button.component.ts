import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { NgClass } from '@angular/common';

export type ButtonVariant = 'filled-primary' | 'filled-accent' | 'outline-primary' | 'ghost-primary' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'lc-button',
  standalone: true,
  imports: [NgClass],
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
