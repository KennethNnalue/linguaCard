import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline, volumeHighOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { Card } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../../../shared/components/article-badge/article-badge.component';
import { HighlightWordPipe } from '../../../../shared/pipes/highlight-word.pipe';
import { ARTICLE_GENDER_MAP } from '../../../../models/review.model';
import { TypedAnswerResult } from '../../grading/typed-answer.grader';

interface ResultBanner {
  tint: 'correct' | 'close' | 'wrong';
  icon: string;
  verdictKey: string;
  hasGenderNote: boolean;
  genderNoteKey: string;
  genderNoteParams: Record<string, unknown>;
}

const VERDICT_KEY = {
  correct: 'review.type.correct',
  gender: 'review.type.mindGender',
  close: 'review.type.soClose',
  wrong: 'review.type.notQuite',
} as const;

const VERDICT_ICON = { correct: '✓', close: '≈', wrong: '✕' } as const;

@Component({
  selector: 'lc-rv-card-back',
  templateUrl: './card-back.component.html',
  styleUrls: ['./card-back.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ArticleBadgeComponent, HighlightWordPipe, TranslatePipe],
})
export class CardBackComponent {
  readonly card = input.required<Card>();
  readonly typedResult = input<TypedAnswerResult | null>(null);
  readonly expandedSynonym = input<number | null>(null);
  readonly isPronunciationLoading = input(false);

  readonly toggleSynonym = output<number>();
  readonly playAudio = output<void>();
  readonly playExample = output<string>();

  constructor() {
    addIcons({ chevronDownOutline, volumeHighOutline });
  }

  readonly genderWord = computed(() => {
    const c = this.card().content;
    if (!c.article) return '';
    return c.gender ?? ARTICLE_GENDER_MAP[c.article] ?? '';
  });

  readonly banner = computed<ResultBanner | null>(() => {
    const r = this.typedResult();
    if (!r) return null;

    let genderNoteKey = '';
    let genderNoteParams: Record<string, unknown> = {};
    if (r.outcome === 'gender') {
      genderNoteKey = r.userArticle ? 'review.type.itsArticleNot' : 'review.type.dontForgetArticle';
      genderNoteParams = { article: r.correctArticle, userArticle: r.userArticle };
    } else if (r.outcome === 'close' && r.articleWrong) {
      genderNoteKey = 'review.type.alsoArticle';
      genderNoteParams = { article: r.correctArticle };
    }

    return {
      tint: r.tint,
      icon: VERDICT_ICON[r.tint],
      verdictKey: VERDICT_KEY[r.outcome],
      hasGenderNote: !!genderNoteKey,
      genderNoteKey,
      genderNoteParams,
    };
  });

  isSynonymExpanded(i: number): boolean {
    return this.expandedSynonym() === i;
  }
}
