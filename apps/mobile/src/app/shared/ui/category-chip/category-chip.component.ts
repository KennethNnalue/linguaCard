import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'lc-category-chip',
  standalone: true,
  templateUrl: './category-chip.component.html',
  styleUrl: './category-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryChipComponent {
  label = input.required<string>();
  count = input<number | undefined>(undefined);
  active = input(false);

  chipClick = output<void>();
}
