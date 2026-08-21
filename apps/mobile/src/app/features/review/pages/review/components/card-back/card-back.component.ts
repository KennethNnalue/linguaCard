import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline, ellipsisVerticalOutline, volumeHighOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import type { Card } from '@lingua-card/shared/domain';
import { ArticleBadgeComponent } from '../../../../../../shared/components/article-badge/article-badge.component';
import { HighlightWordPipe } from '../../../../shared/pipes/highlight-word.pipe';
import { TypedAnswerFeedback } from '../../../../services/answer-evaluator.service';
import { buildReviewReveal } from '../../../../application/build-review-reveal';
import { buildReviewEnrichment, nextReviewEnrichmentTab, ReviewEnrichmentTab } from '../../../../application/build-review-enrichment';

@Component({
  selector: 'lc-rv-card-back',
  templateUrl: './card-back.component.html',
  styleUrls: ['./card-back.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ArticleBadgeComponent, HighlightWordPipe, TranslatePipe],
})
export class CardBackComponent {
  readonly card = input.required<Card>();
  readonly typedResult = input<TypedAnswerFeedback | null>(null);
  readonly expandedSynonym = input<number | null>(null);
  readonly isPronunciationLoading = input(false);
  readonly isAudioPlaying = input(false);
  readonly audioPlaybackError = input(false);
  readonly busy = input(false);
  readonly readOnly = input(false);

  readonly toggleSynonym = output<number>();
  readonly playAudio = output<void>();
  readonly playExample = output<string>();
  readonly cardActionsRequested = output<void>();
  readonly selectedTab = signal<ReviewEnrichmentTab | null>(null);

  constructor() {
    addIcons({ chevronDownOutline, ellipsisVerticalOutline, volumeHighOutline });
    effect(() => {
      const enrichment = buildReviewEnrichment(this.card().content);
      this.selectedTab.set(enrichment.initialTab);
    });
  }

  readonly reveal = computed(() => buildReviewReveal(this.card().content.article, this.typedResult()));
  readonly banner = computed(() => this.reveal().verdict);
  readonly enrichment = computed(() => buildReviewEnrichment(this.card().content));

  selectTab(tab: ReviewEnrichmentTab): void {
    if (this.enrichment().tabs.includes(tab)) this.selectedTab.set(tab);
  }

  onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const current = this.selectedTab();
    if (!current) return;
    event.preventDefault();
    const tablist = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selectedTab.set(nextReviewEnrichmentTab(this.enrichment().tabs, current, event.key === 'ArrowRight' ? 1 : -1));
    queueMicrotask(() => tablist?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  }

  isSynonymExpanded(i: number): boolean {
    return this.expandedSynonym() === i;
  }

  toggleActionsMenu(): void {
    if (this.busy() || this.readOnly()) return;
    this.cardActionsRequested.emit();
  }
}
