import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'lc-empty-state',
  standalone: true,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  icon = input.required<string>();
  title = input.required<string>();
  subtitle = input.required<string>();
}
