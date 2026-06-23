import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { StoryKeyword } from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-keywords-tab',
  templateUrl: './keywords-tab.component.html',
  styleUrls: ['./keywords-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class KeywordsTabComponent {
  readonly keywords = input<StoryKeyword[]>([]);
  readonly loading = input<boolean>(false);

  /** Row tapped — opens the word bottom sheet for this keyword. */
  readonly wordClick = output<StoryKeyword>();

  isVerb(kw: StoryKeyword): boolean {
    return kw.wordType === 'verb';
  }
}
