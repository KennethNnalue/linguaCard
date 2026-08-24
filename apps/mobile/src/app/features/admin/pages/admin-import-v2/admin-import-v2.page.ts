import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import type {
  AdminPlatformCollectionImportPayload,
  CefrLevel,
} from '@lingua-card/shared/domain';
import { CollectionCoverComponent } from '../../../vault/components/collection-cover/collection-cover.component';
import { PlatformCollectionImportStore } from '../../store/platform-collection-import.store';

@Component({
  selector: 'lc-admin-import-v2',
  templateUrl: './admin-import-v2.page.html',
  styleUrls: ['./admin-import-v2.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, CollectionCoverComponent],
  providers: [PlatformCollectionImportStore],
})
export class AdminImportV2Page {
  readonly store = inject(PlatformCollectionImportStore);
  private readonly router = inject(Router);
  readonly localError = signal<string | null>(null);

  async selectFile(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    try {
      const payload = this.parsePayload(await input.files[0].text(), input.files[0].name);
      this.localError.set(null);
      this.store.validate(payload);
    } catch {
      this.localError.set('Choose a valid V2 collection JSON file.');
    }
  }

  importDraft(): void {
    this.store.importDraft();
  }

  retryAudio(importId: string): void {
    this.store.retryAudio(importId);
  }

  goBack(): void {
    void this.router.navigate(['/admin/import']);
  }

  private parsePayload(text: string, fileName: string): AdminPlatformCollectionImportPayload {
    const value: unknown = JSON.parse(text);
    if (!this.isRecord(value) || value['schemaVersion'] !== 2) throw new Error('Invalid schema');
    const rawCollection = value['collection'];
    if (!this.isRecord(rawCollection)) throw new Error('Invalid collection');
    const rawCover = rawCollection['cover'];
    if (!this.isRecord(rawCover) || rawCover['mode'] !== 'derived') throw new Error('Invalid cover');
    const levelValue = this.requiredString(rawCollection, 'level');
    if (!this.isCefrLevel(levelValue)) throw new Error('Invalid level');
    const rawItems = value['items'];
    if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error('Invalid items');
    return {
      schemaVersion: 2,
      fileName,
      collection: {
        externalId: this.requiredString(rawCollection, 'externalId'),
        title: this.requiredString(rawCollection, 'title'),
        description: this.requiredString(rawCollection, 'description'),
        sourceLanguage: this.requiredString(rawCollection, 'sourceLanguage'),
        targetLanguage: this.requiredString(rawCollection, 'targetLanguage'),
        level: levelValue,
        topic: this.requiredString(rawCollection, 'topic'),
        cover: { mode: 'derived' },
      },
      items: rawItems.map(item => this.parseItem(item)),
    };
  }

  private parseItem(value: unknown): AdminPlatformCollectionImportPayload['items'][number] {
    if (!this.isRecord(value)) throw new Error('Invalid item');
    const rawLexeme = value['lexeme'];
    const rawLocalization = value['localization'];
    const rawExamples = value['examples'];
    if (!this.isRecord(rawLexeme) || !this.isRecord(rawLocalization) || !Array.isArray(rawExamples)) {
      throw new Error('Invalid item content');
    }
    const rawGrammar = rawLexeme['grammar'];
    if (!this.isRecord(rawGrammar)) throw new Error('Invalid grammar');
    const partOfSpeech = this.requiredString(rawLexeme, 'partOfSpeech');
    if (!this.isPartOfSpeech(partOfSpeech)) throw new Error('Invalid part of speech');
    const cefr = this.nullableString(rawLexeme['cefrLevel']);
    if (cefr !== null && !this.isCefrLevel(cefr)) throw new Error('Invalid CEFR level');
    const position = value['position'];
    if (typeof position !== 'number' || !Number.isInteger(position)) throw new Error('Invalid position');
    return {
      position,
      lexeme: {
        text: this.requiredString(rawLexeme, 'text'),
        partOfSpeech,
        grammar: {
          article: this.nullableString(rawGrammar['article']),
          gender: this.nullableString(rawGrammar['gender']),
          plurals: this.stringArray(rawGrammar['plurals']),
        },
        phonetic: this.nullableString(rawLexeme['phonetic']),
        cefrLevel: cefr,
      },
      localization: {
        language: this.requiredString(rawLocalization, 'language'),
        translation: this.requiredString(rawLocalization, 'translation'),
        definition: this.nullableString(rawLocalization['definition']),
      },
      examples: rawExamples.map(example => {
        if (!this.isRecord(example)) throw new Error('Invalid example');
        return {
          targetText: this.requiredString(example, 'targetText'),
          sourceText: this.requiredString(example, 'sourceText'),
        };
      }),
    };
  }

  private nullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw new Error('Invalid optional text');
    return value.trim() || null;
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Invalid text array');
    return value.map(item => item.trim()).filter(Boolean);
  }

  private requiredString(value: Readonly<Record<string, unknown>>, key: string): string {
    const field = value[key];
    if (typeof field !== 'string' || !field.trim()) throw new Error(`Invalid ${key}`);
    return field.trim();
  }

  private isCefrLevel(value: string): value is CefrLevel {
    return ['A1', 'A2', 'B1', 'B2', 'C1'].includes(value);
  }

  private isPartOfSpeech(
    value: string,
  ): value is AdminPlatformCollectionImportPayload['items'][number]['lexeme']['partOfSpeech'] {
    return ['noun', 'verb', 'adjective', 'adverb', 'other'].includes(value);
  }

  private isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
