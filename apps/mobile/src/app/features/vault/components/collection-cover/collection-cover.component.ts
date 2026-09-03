import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';

@Component({
  selector: 'lc-collection-cover',
  template: `
    <span class="cover" [class]="paletteClass()">
      @if (imageUrl()) {
        <img class="image" [lcOfflineSrc]="imageUrl()" alt="" />
      } @else {
        <span class="mark" aria-hidden="true"></span>
        <span class="initial" aria-hidden="true">{{ initial() }}</span>
      }
    </span>
  `,
  styleUrls: ['./collection-cover.component.scss'],
  imports: [OfflineImageDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-label]': 'name()',
    role: 'img',
  },
})
export class CollectionCoverComponent {
  readonly name = input.required<string>();
  readonly seed = input.required<string>();
  readonly imageUrl = input<string | null>(null);

  readonly initial = computed(() => Array.from(this.name().trim())[0]?.toLocaleUpperCase() ?? '•');
  readonly paletteClass = computed(() => {
    let hash = 0;
    for (const character of this.seed()) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) | 0;
    return `palette-${(Math.abs(hash) % 4) + 1}`;
  });
}
