import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IonButton } from '@ionic/angular';
import type { PodcastRecommendation, PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';

@Component({
  selector: 'lc-podcast-recommendation', standalone: true, imports: [IonButton, OfflineImageDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article aria-label="Recommended conversation">
      <img [lcOfflineSrc]="recommendation().episode.thumbnail.cardUrl" alt="" />
      <div class="copy">
        <small>{{ fitKey() | translate }}</small>
        <h2>{{ recommendation().episode.title }}</h2>
        <p>{{ recommendation().episode.titleTranslation }}</p>
        <p>{{ recommendation().episode.level }} · {{ minutes() }} min · {{ reasonKey() | translate:{ count: recommendation().matchCount } }}</p>
        @if (recommendation().matchedWords.length) {
          <p class="words">@for (word of recommendation().matchedWords; track word.lexemeId) { <span>{{ word.text }}</span> }</p>
        }
        @if (evidence() === 'pending_sync') { <p role="status">{{ 'podcasts.discovery.pending' | translate }}</p> }
        @if (evidence() === 'unavailable') { <p>{{ 'podcasts.discovery.offline' | translate }}</p> }
        <div class="actions">
          <ion-button class="primary" (click)="listenSelected.emit()">Listen now</ion-button>
          <ion-button fill="outline" (click)="preview.emit()">Preview words</ion-button>
        </div>
      </div>
    </article>`,
  styles: [`
    article { display:grid; grid-template-columns:80px minmax(0,1fr); gap:16px; background:var(--lc-surface, #14241c); border:1px solid #35483f; border-radius:20px; padding:18px; color:var(--lc-text-primary, #f4efe4); }
    img { width:80px; height:80px; object-fit:cover; border-radius:12px; }
    .copy { min-width:0; } h2 { margin:6px 0; font-size:1.25rem; line-height:1.3; overflow-wrap:anywhere; } small { color:var(--lc-ss-sage); }
    p { margin:6px 0; line-height:1.4; font-size:.875rem; } .words { display:flex; flex-wrap:wrap; gap:6px; } .words span { background:#23352a; border-radius:6px; padding:3px 8px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; } ion-button { margin:0; min-height:44px; --border-radius:12px; --color:var(--lc-ss-sage); --border-color:#567969; text-transform:none; }
    .primary { --background:var(--lc-ss-sage); --color:#102119; }
    @media(max-width:420px) { article { grid-template-columns:56px minmax(0,1fr); gap:12px; padding:14px; } img { width:56px; height:56px; } }
  `],
})
export class PodcastRecommendationComponent implements AfterViewInit {
  readonly recommendation = input.required<PodcastRecommendation>();
  readonly evidence = input<PodcastRecommendationResponse['evidence']>('current');
  readonly listenSelected = output<void>(); readonly preview = output<void>(); readonly visible = output<void>();
  readonly minutes = computed(() => Math.max(1, Math.round(this.recommendation().episode.durationMs / 60000)));
  readonly fitKey = computed(() => `podcasts.discovery.fit.${this.recommendation().fit ?? (this.recommendation().reason === 'starter' ? 'starter' : 'overlap')}`);
  readonly reasonKey = computed(() => {
    const item = this.recommendation();
    if (item.reason === 'starter') return 'podcasts.discovery.translations';
    const source = this.evidence() !== 'current' ? 'saved' : item.reason === 'session_words' ? 'session' : item.reason === 'recent_words' ? 'recent' : 'vocabulary';
    return `podcasts.discovery.${source}.${item.matchCount === 1 ? 'one' : 'other'}`;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) { this.visible.emit(); observer.disconnect(); }
    }, { threshold: 0.5 });
    observer.observe(this.host.nativeElement); this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
