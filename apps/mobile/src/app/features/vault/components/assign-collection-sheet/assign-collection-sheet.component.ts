import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { CreateCollectionDto } from '../../../../core/models/mock-data';
import { CollectionStore } from '../../store/collection.store';

@Component({
  selector: 'lc-assign-collection-sheet',
  standalone: true,
  templateUrl: './assign-collection-sheet.component.html',
  styleUrls: ['./assign-collection-sheet.component.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, ReactiveFormsModule],
})
export class AssignCollectionSheetComponent implements OnInit {
  @Input() selectedCollectionId: string | null = null;
  @Input() required = false;
  /** When true: creating a collection immediately dismisses the modal with the new ID. */
  @Input() autoConfirmOnCreate = false;

  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);

  readonly collections = this.collectionStore.collections;
  readonly selected = signal<string | null>(null);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);

  readonly newNameCtrl = new FormControl('', [Validators.required, Validators.minLength(1)]);

  constructor() {
    addIcons({ addOutline, checkmarkOutline, closeOutline });
  }

  ngOnInit(): void {
    this.selected.set(this.selectedCollectionId);
  }

  select(id: string): void {
    this.selected.set(this.selected() === id && !this.required ? null : id);
    this.showCreateForm.set(false);
  }

  toggleCreateForm(): void {
    this.showCreateForm.update(v => !v);
    if (this.showCreateForm()) {
      this.newNameCtrl.reset();
    }
  }

  createAndSelect(): void {
    if (this.newNameCtrl.invalid || this.creating()) return;
    this.creating.set(true);
    const dto: CreateCollectionDto = {
      name: this.newNameCtrl.value!.trim(),
      contextId: 'german-vocab',
      emoji: '📚',
    };
    this.collectionStore.createCollection(dto).subscribe({
      next: col => {
        this.creating.set(false);
        this.showCreateForm.set(false);
        this.newNameCtrl.reset();
        this.selected.set(col.id);
        if (this.autoConfirmOnCreate) {
          this.modalCtrl.dismiss({ collectionId: col.id });
        }
      },
      error: () => this.creating.set(false),
    });
  }

  confirm(): void {
    this.modalCtrl.dismiss({ collectionId: this.selected() });
  }

  skip(): void {
    this.modalCtrl.dismiss({ collectionId: null });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
