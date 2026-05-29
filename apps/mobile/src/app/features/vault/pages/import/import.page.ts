import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cloudUploadOutline,
  documentOutline,
  downloadOutline,
} from 'ionicons/icons';
import { CsvParserService } from '../../../../shared/csv/csv-parser.service';
import { CategoryStore } from '../../store/category.store';
import { ImportStateService } from '../../services/import-state.service';

@Component({
  selector: 'app-import',
  standalone: true,
  templateUrl: './import.page.html',
  styleUrls: ['./import.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon],
})
export class ImportPage {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly csvService = inject(CsvParserService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly importState = inject(ImportStateService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);

  readonly dragActive = signal(false);

  constructor() {
    addIcons({ arrowBackOutline, cloudUploadOutline, documentOutline, downloadOutline });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(): void {
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.processFile(file);
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

  goBack(): void {
    this.router.navigate(['/vault']);
  }

  private processFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.showToast('Please select a .csv file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = this.csvService.parse(text, file.name, this.categoryStore.categories());
      if (result.totalRows === 0) {
        this.showToast('No words found in this file');
        return;
      }
      this.importState.set(result);
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
