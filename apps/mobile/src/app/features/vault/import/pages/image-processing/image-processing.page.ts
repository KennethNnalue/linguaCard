import { AppNotificationService } from '@lingua-card/mobile/notifications';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { EnrichWordsResult, WordExtractionResult } from '@lingua-card/shared/domain';
import { ImageImportApiService } from '../../services/image-import-api.service';
import { ImageImportStateService } from '../../image-import-state.service';

export type ProcessingPhase = 'extracting' | 'enriching' | 'partial' | 'done';

@Component({
  selector: 'lc-image-processing',
  standalone: true,
  templateUrl: './image-processing.page.html',
  styleUrls: ['./image-processing.page.scss'],
  imports: [IonContent, TranslatePipe],
})
export class ImageProcessingPage implements OnInit, OnDestroy {
  private readonly importImageState = inject(ImageImportStateService);
  private readonly imageImportApi   = inject(ImageImportApiService);
  private readonly router           = inject(Router);
  private readonly toastCtrl        = inject(AppNotificationService);
  private readonly translateService = inject(TranslateService);

  readonly image          = this.importImageState.image;
  readonly phase          = signal<ProcessingPhase>('extracting');
  readonly extractedCount = signal(0);
  readonly enrichedCount  = signal(0);
  readonly totalCount     = signal(0);
  readonly pendingCount   = signal(0);

  /** Chips shown once Phase 2 starts — populated progressively */
  readonly enrichedWords  = signal<string[]>([]);

  readonly phase1Done  = computed(() => this.phase() !== 'extracting');
  readonly phase1Label = computed(() =>
    this.phase1Done()
      ? `Found ${this.extractedCount()} words`
      : 'Spotting vocabulary…'
  );
  readonly phase2Label = computed(() => {
    const p = this.phase();
    if (p === 'extracting') return 'Generating flashcards';
    if (p === 'enriching')  return `Generating cards… ${this.enrichedCount()} of ${this.totalCount()}`;
    if (p === 'partial')    return `${this.enrichedCount()} of ${this.totalCount()} cards generated`;
    return 'Cards generated';
  });

  private timers: ReturnType<typeof setTimeout>[] = [];
  private intervals: ReturnType<typeof setInterval>[] = [];

  ngOnInit(): void {
    if (!this.image()) {
      this.router.navigate(['/vault/import/image']);
      return;
    }
    void this.run();
  }

  private async run(): Promise<void> {
    const image = this.image()!;

    // ── Phase 1: Extract raw words from image ─────────────────────────────────
    this.phase.set('extracting');
    let extraction: WordExtractionResult;
    try {
      extraction = await firstValueFrom(this.imageImportApi.extractWords(image));
    } catch (err) {
      await this.showError(err, 'Could not read image. Please try again.');
      return;
    }

    this.extractedCount.set(extraction.totalFound);
    this.totalCount.set(extraction.totalFound);
    this.importImageState.setExtractionResult(extraction);

    if (extraction.totalFound === 0) {
      const toast = await this.toastCtrl.create({
        message: this.translateService.instant('imageProcessing.errors.noWordsFound'),
        duration: 3500,
        color: 'warning',
      });
      await toast.present();
      this.router.navigate(['/vault/import/image']);
      return;
    }

    // ── Phase 2: Enrich words into full card data ─────────────────────────────
    this.phase.set('enriching');

    // Simulate count ticking up while we wait for the single batch HTTP call
    const total = extraction.totalFound;
    const batchSize = 10;
    let simCount = 0;
    const simInterval = setInterval(() => {
      simCount = Math.min(simCount + batchSize, Math.floor(total * 0.85));
      this.enrichedCount.set(simCount);
    }, 1800);
    this.intervals.push(simInterval);

    let enrichResult: EnrichWordsResult;
    try {
      enrichResult = await firstValueFrom(
        this.imageImportApi.enrichWords({
          rawWords: extraction.rawWords,
          targetLanguage: 'de',
          nativeLanguage: 'en',
        }),
      );
    } catch {
      enrichResult = { enriched: [], pending: extraction.rawWords, isComplete: false };
    }

    clearInterval(simInterval);
    this.enrichedCount.set(enrichResult.enriched.length);
    this.pendingCount.set(enrichResult.pending.length);
    this.importImageState.setEnrichResult(enrichResult);

    // Reveal word chips one at a time for visual feedback
    const chips = enrichResult.enriched.slice(0, 8).map(w => w.back);
    for (let i = 0; i < chips.length; i++) {
      this.enrichedWords.set(chips.slice(0, i + 1));
      await this.delay(120);
    }

    if (!enrichResult.isComplete) {
      this.phase.set('partial');
      // Hold on I04 so user reads the partial result before navigating to review
      await this.delay(2500);
    } else {
      this.phase.set('done');
    }

    this.router.navigate(['/vault/import/image/review']);
  }

  cancel(): void {
    this.importImageState.clear();
    this.router.navigate(['/vault/import/image']);
  }

  private async showError(err: unknown, fallback: string): Promise<void> {
    const status: number = (err as { status?: number })?.status ?? 0;
    const message: string = (err as { error?: { message?: string } })?.error?.message ?? fallback;
    this.importImageState.setError(this.toErrorCode(status));
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      color: 'danger',
    });
    await toast.present();
    this.router.navigate(['/vault/import/image']);
  }

  private toErrorCode(status: number): Parameters<ImageImportStateService['setError']>[0] {
    if (status === 400) return 'no_words';
    if (status === 422) return 'blurry';
    if (status === 413) return 'too_large';
    if (status === 429) return 'quota_exceeded';
    if (status === 0)   return 'network_error';
    return 'ai_error';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.timers.push(setTimeout(resolve, ms));
    });
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
  }
}
