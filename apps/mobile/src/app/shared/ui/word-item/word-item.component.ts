import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { Card } from '../../../core/models/mock-data';
import { ArticleBadgeComponent } from '../../components/article-badge/article-badge.component';
import { MasteryDotComponent } from '../../components/mastery-dot/mastery-dot.component';

@Component({
  selector: 'lc-word-item',
  standalone: true,
  imports: [ArticleBadgeComponent, MasteryDotComponent],
  templateUrl: './word-item.component.html',
  styleUrl: './word-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordItemComponent {
  card = input.required<Card>();
  showMastery = input(true);
  showAudio = input(false);
  interactive = input(true);
}
