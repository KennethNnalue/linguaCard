import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, Location } from '@angular/common';
import { IonContent, IonHeader, IonIcon, IonToolbar, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, copyOutline, pricetagsOutline } from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { AdminDiscountCodeListItem, AdminGenerateDiscountCodeDto } from '@lingua-card/shared/domain';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'lc-admin-discount-codes',
  templateUrl: './admin-discount-codes.page.html',
  styleUrls: ['./admin-discount-codes.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule, TranslatePipe, DatePipe],
})
export class AdminDiscountCodesPage implements OnInit {
  private readonly adminApi   = inject(AdminApiService);
  private readonly toastCtrl  = inject(ToastController);
  private readonly translate  = inject(TranslateService);
  private readonly location   = inject(Location);
  private readonly _destroyRef = inject(DestroyRef);

  readonly codes      = signal<AdminDiscountCodeListItem[]>([]);
  readonly loading    = signal(false);
  readonly generating = signal(false);

  readonly form = new FormGroup({
    code:           new FormControl(''),
    percentOff:     new FormControl<number>(100, [Validators.required, Validators.min(1), Validators.max(100)]),
    lifetime:       new FormControl<boolean>(true),
    durationDays:   new FormControl<number | null>(null),
    maxRedemptions: new FormControl<number | null>(null),
    expiresAt:      new FormControl<string | null>(null),
    label:          new FormControl(''),
  });

  constructor() {
    addIcons({ arrowBackOutline, copyOutline, pricetagsOutline });
  }

  ngOnInit(): void {
    this.loadCodes();

    // Require a duration when "lifetime" is unchecked, so a blank value can't be
    // silently sent as null (which the backend would treat as lifetime).
    const durationCtrl = this.form.controls.durationDays;
    this.form.controls.lifetime.valueChanges
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((lifetime) => {
        durationCtrl.setValidators(lifetime ? [] : [Validators.required, Validators.min(1)]);
        durationCtrl.updateValueAndValidity();
      });
  }

  goBack(): void {
    this.location.back();
  }

  loadCodes(): void {
    this.loading.set(true);
    this.adminApi.listDiscountCodes()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (codes) => { this.codes.set(codes); this.loading.set(false); },
        error: () => { this.loading.set(false); void this._toast('admin.discountCodes.loadError', 'danger'); },
      });
  }

  generate(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.generating()) return;

    const v = this.form.getRawValue();
    const dto: AdminGenerateDiscountCodeDto = {
      code:           v.code?.trim() || undefined,
      percentOff:     v.percentOff ?? 100,
      durationDays:   v.lifetime ? null : (v.durationDays ?? null),
      maxRedemptions: v.maxRedemptions || null,
      expiresAt:      v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      label:          v.label?.trim() || undefined,
    };

    this.generating.set(true);
    this.adminApi.generateDiscountCode(dto)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (created) => {
          this.generating.set(false);
          this.codes.update((list) => [created, ...list]);
          this.form.reset({ percentOff: 100, lifetime: true, durationDays: null, maxRedemptions: null, expiresAt: null, code: '', label: '' });
          void this._toast('admin.discountCodes.created', 'success', { code: created.code });
        },
        error: () => {
          this.generating.set(false);
          void this._toast('admin.discountCodes.createError', 'danger');
        },
      });
  }

  toggleActive(code: AdminDiscountCodeListItem): void {
    const next = !code.isActive;
    this.adminApi.setDiscountCodeActive(code.id, next)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => this.codes.update((list) =>
          list.map((c) => (c.id === code.id ? { ...c, isActive: next } : c))),
        error: () => void this._toast('admin.discountCodes.updateError', 'danger'),
      });
  }

  async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      void this._toast('admin.discountCodes.copied', 'success', { code });
    } catch {
      // Clipboard unavailable — ignore silently.
    }
  }

  private async _toast(key: string, color: 'success' | 'danger', params?: Record<string, unknown>): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key, params),
      duration: 2200,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
