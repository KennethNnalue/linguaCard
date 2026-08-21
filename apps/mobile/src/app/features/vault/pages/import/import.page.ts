import { AppNotificationService } from '@lingua-card/mobile/notifications';
import {Component, ElementRef, inject, signal, ViewChild} from '@angular/core';
import {Router} from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
  } from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
  arrowBackOutline,
  cameraOutline,
  checkmarkOutline,
  chevronForwardOutline,
  closeOutline,
  cloudUploadOutline,
  copyOutline,
  documentOutline,
  downloadOutline,
  informationCircleOutline,
  sparklesOutline,
} from 'ionicons/icons';
import {TranslateService, TranslatePipe} from '@ngx-translate/core';
import {CsvParserService} from '../../../../shared/csv/csv-parser.service';
import {CategoryStore} from '../../store/category.store';
import {ImportStateService} from '../../services/import-state.service';
import {CLIPBOARD_PROMPT, DISPLAY_PROMPT} from './import-prompt.constants';

@Component({
  selector: 'lc-import',
  standalone: true,
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, TranslatePipe],
})
export class ImportPage {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly csvService = inject(CsvParserService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly importState = inject(ImportStateService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(AppNotificationService);
  private readonly modalCtrl = inject(ModalController);
  private readonly translate = inject(TranslateService);

  set isModal(v: boolean) { this._isModal.set(v ?? false); }
  readonly _isModal = signal(false);

  readonly promptCopied = signal(false);

  readonly DISPLAY_PROMPT = DISPLAY_PROMPT;

  constructor() {
    addIcons({
      arrowBackOutline,
      cameraOutline,
      checkmarkOutline,
      chevronForwardOutline,
      closeOutline,
      cloudUploadOutline,
      copyOutline,
      documentOutline,
      downloadOutline,
      informationCircleOutline,
      sparklesOutline,
    });
  }

  openFilePicker(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.processFile(file);
    input.value = '';
  }

  downloadTemplate(): void {
    fetch('/assets/linguacard-words.csv')
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'linguacard-words.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async navigateToImageImport(): Promise<void> {
    if (this._isModal()) {
      await this.modalCtrl.dismiss();
    }
    this.router.navigate(['/vault/import/image']);
  }

  async goBack(): Promise<void> {
    if (this._isModal()) {
      await this.modalCtrl.dismiss();
    } else {
      this.router.navigate(['/vault']);
    }
  }

  async copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(CLIPBOARD_PROMPT);
      this.onPromptCopied();
    } catch {
      this.fallbackCopy(CLIPBOARD_PROMPT);
    }
  }

  private onPromptCopied(): void {
    this.promptCopied.set(true);
    this.showToast(this.translate.instant('import.toast.promptCopied'));
    setTimeout(() => this.promptCopied.set(false), 8_000);
  }

  private fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    this.onPromptCopied();
  }

  private processFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.showToast(this.translate.instant('import.errors.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const result = this.csvService.parse(text, file.name, this.categoryStore.categories());
      if (result.totalRows === 0) {
        this.showToast(this.translate.instant('import.errors.noWordsFound'));
        return;
      }
      this.importState.set(result);
      if (this._isModal()) await this.modalCtrl.dismiss();
      this.router.navigate(['/vault/import/review']);
    };
    reader.readAsText(file, 'UTF-8');
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      color: 'warning',
    });
    await toast.present();
  }
}
