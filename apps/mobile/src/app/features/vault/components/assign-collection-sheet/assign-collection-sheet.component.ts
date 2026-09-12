import { ChangeDetectionStrategy, Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import {
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { addOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { CreateCollectionDto } from '../../../../core/models/mock-data';
import { CollectionStore } from '../../store/collection.store';

@Component({
  selector: 'lc-assign-collection-sheet',
  templateUrl: './assign-collection-sheet.component.html',
  styleUrls: ['./assign-collection-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonIcon, IonSearchbar, ReactiveFormsModule, TranslatePipe],
})
export class AssignCollectionSheetComponent implements OnInit {
  @Input() selectedCollectionId: string | null = null;
  @Input() required = false;
  /** When true: creating a collection immediately dismisses the modal with the new ID. */
  @Input() autoConfirmOnCreate = false;

  private readonly collectionStore = inject(CollectionStore);
  private readonly modalCtrl = inject(ModalController);

  readonly collections = this.collectionStore.collections;
  readonly searchCtrl = new FormControl('', { nonNullable: true });
  private readonly searchQuery = toSignal(this.searchCtrl.valueChanges, { initialValue: '' });
  readonly filteredCollections = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    if (!query) return this.collections();
    return this.collections().filter(collection =>
      collection.name.toLocaleLowerCase().includes(query),
    );
  });
  readonly selected = signal<string | null>(null);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);

  readonly newNameCtrl = new FormControl('', [Validators.required, Validators.minLength(1)]);
  readonly newLevelCtrl = new FormControl<'all' | 'A1' | 'A2' | 'B1' | 'B2'>('all', {nonNullable: true});
  readonly levels = ['all', 'A1', 'A2', 'B1', 'B2'] as const;

  constructor() {
    addIcons({ addOutline, checkmarkOutline, closeOutline });
  }

  ngOnInit(): void {
    this.selected.set(this.selectedCollectionId);
    this.collectionStore.loadCollections();
  }

  select(id: string): void {
    this.selected.set(this.selected() === id && !this.required ? null : id);
    this.showCreateForm.set(false);
  }

  toggleCreateForm(): void {
    this.showCreateForm.update(v => !v);
    if (this.showCreateForm()) {
      this.newNameCtrl.reset();
      this.newLevelCtrl.reset();
    }
  }

  createAndSelect(): void {
    if (this.newNameCtrl.invalid || this.creating()) return;
    this.creating.set(true);
    const dto: CreateCollectionDto = {
      name: this.newNameCtrl.value!.trim(),
      contextId: 'german-vocab',
      emoji: '📚',
      level: this.newLevelCtrl.value === 'all' ? null : this.newLevelCtrl.value,
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
