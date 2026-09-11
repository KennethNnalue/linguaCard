import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { volumeHighOutline } from 'ionicons/icons';
import type { StoryKeyword, StorySentence } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../shared/components/article-badge/article-badge.component';

export interface StoryKeywordUsage {
  keyword: StoryKeyword;
  example: StorySentence | null;
}

const SEPARABLE_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'her', 'hin', 'los', 'mit', 'nach', 'vor', 'weg', 'weiter', 'zu', 'zurück',
];

export function findKeywordExample(
  keyword: StoryKeyword,
  sentences: readonly StorySentence[],
): StorySentence | null {
  const base = keyword.germanBase.toLocaleLowerCase();
  const candidates = new Set([base, ...base.split(/\s+/u)]);
  if (keyword.wordType === 'verb') {
    const infinitiveStem = base.replace(/(?:en|n)$/u, '');
    candidates.add(infinitiveStem);
    const prefix = SEPARABLE_PREFIXES.find(value => infinitiveStem.startsWith(value));
    if (prefix) candidates.add(infinitiveStem.slice(prefix.length));
  }
  return sentences.find(sentence => {
    const text = sentence.german.toLocaleLowerCase();
    return [...candidates].some(candidate => candidate.length >= 3 && text.includes(candidate));
  }) ?? null;
}

@Component({
  selector: 'lc-keywords-tab',
  templateUrl: './keywords-tab.component.html',
  styleUrls: ['./keywords-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArticleBadgeComponent, IonButton, IonIcon, TranslatePipe],
})
export class KeywordsTabComponent {
  readonly keywords = input<StoryKeyword[]>([]);
  readonly sentences = input<StorySentence[]>([]);
  readonly loading = input<boolean>(false);

  /** Row tapped — opens the word bottom sheet for this keyword. */
  readonly wordClick = output<StoryKeyword>();
  readonly playAudio = output<StoryKeywordUsage>();

  readonly keywordUsages = computed(() => this.keywords().map(keyword => ({
    keyword,
    example: findKeywordExample(keyword, this.sentences()),
  })));

  constructor() {
    addIcons({ volumeHighOutline });
  }

  isVerb(kw: StoryKeyword): boolean {
    return kw.wordType === 'verb';
  }
}
