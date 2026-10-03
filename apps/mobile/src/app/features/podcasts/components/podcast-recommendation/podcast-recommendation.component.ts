import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';
import type { PodcastRecommendation, PodcastRecommendationResponse } from '@lingua-card/shared/domain';
import { OfflineImageDirective } from '../../../../shared/image/offline-image.directive';

@Component({
  selector: 'lc-podcast-recommendation', standalone: true, imports: [IonButton, OfflineImageDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article aria-label="Recommended conversation">
      <img [lcOfflineSrc]="recommendation().episode.thumbnail.cardUrl" alt="" />
      <div class="copy">
        <small>{{ recommendation().reason === 'starter' ? 'Try a short conversation' : 'Hear your words in a conversation' }}</small>
        <h2>{{ recommendation().episode.title }}</h2>
        <p>{{ recommendation().episode.titleTranslation }}</p>
        <p>{{ recommendation().episode.level }} · {{ minutes() }} min · {{ reason() }}</p>
        @if (recommendation().matchedWords.length) {
          <p class="words">@for (word of recommendation().matchedWords; track word.lexemeId) { <span>{{ word.text }}</span> }</p>
        }
        @if (evidence() === 'pending_sync') { <p role="status">Suggestions will refresh after your reviews sync.</p> }
        @if (evidence() === 'unavailable') { <p>Saved suggestion · Connect to refresh</p> }
        <div class="actions">
          <ion-button (click)="play.emit()">Listen now</ion-button>
          <ion-button fill="outline" (click)="preview.emit()">Preview words</ion-button>
        </div>
      </div>
    </article>`,
  styles: [`article { display:flex; gap:16px; background:var(--lc-surface, #1c2b24); border:1px solid #35483f; border-radius:20px; padding:18px; margin:20px 0; color:var(--lc-text-primary, #e9eee9); }
    img { width:100px; height:100px; object-fit:cover; border-radius:12px; flex-shrink:0; }
    .copy { min-width:0; } h2 { margin:8px 0; font-size:1.3rem; overflow-wrap:anywhere; } small { color:#8cc9b5; }
    p { margin:8px 0; line-height:1.5; } .words { display:flex; flex-wrap:wrap; gap:8px; } .words span { border:1px solid #567969; border-radius:8px; padding:2px 6px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; } ion-button { margin:0; min-height:44px; }
    @media(max-width:420px) { article { flex-direction:column; } img { width:100%; height:130px; } }`],
})
export class PodcastRecommendationComponent implements AfterViewInit {
  readonly recommendation = input.required<PodcastRecommendation>();
  readonly evidence = input<PodcastRecommendationResponse['evidence']>('current');
  readonly play = output<void>(); readonly preview = output<void>(); readonly visible = output<void>();
  readonly minutes = computed(() => Math.max(1, Math.round(this.recommendation().episode.durationMs / 60000)));
  readonly reason = computed(() => {
    const item = this.recommendation();
    if (item.reason === 'starter') return 'Translations available';
    if (this.evidence() !== 'current') return `${item.matchCount} words from your saved vocabulary`;
    const source = item.reason === 'session_words' ? 'this session' : item.reason === 'recent_words' ? 'recent reviews' : 'your vocabulary';
    return `${item.matchCount} words from ${source}`;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { this.visible.emit(); observer.disconnect(); }
    }, { threshold: 0.5 });
    observer.observe(this.host.nativeElement); this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
