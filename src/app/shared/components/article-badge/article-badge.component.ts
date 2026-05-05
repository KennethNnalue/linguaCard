import {Component, computed, Input, signal} from '@angular/core';
import {ArticleType} from "../../../core/models/mock-data";

@Component({
  selector: 'app-article-badge',
  templateUrl: './article-badge.component.html',
  styleUrls: ['./article-badge.component.scss'],
})
export class ArticleBadgeComponent {

  private _article = signal<ArticleType | null>(null);

  @Input() set article(val: ArticleType | null) {
    this._article.set(val);
  }


  badgeClass = computed(() => {
    const a = this._article();
    if (!a) return '';
    const map: Record<string, string> = {
      der: 'lc-article-badge--der',
      die: 'lc-article-badge--die',
      das: 'lc-article-badge--das',
    };
    return map[a] ?? '';
  });
}
