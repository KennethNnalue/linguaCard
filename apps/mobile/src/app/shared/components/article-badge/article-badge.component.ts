import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { ArticleType } from '../../../core/models/mock-data';

@Component({
  selector: 'lc-article-badge',
  standalone: true,
  templateUrl: './article-badge.component.html',
  styleUrl: './article-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleBadgeComponent {
  article = input<ArticleType | null>(null);
}
