import { Injectable } from '@angular/core';
import {
  ArticleType,
  Category,
  ParsedImportResult,
  ParsedImportRow,
  Synonym,
} from '@lingua-card/shared/domain';

const VALID_ARTICLES = new Set(['der', 'die', 'das']);

/**
 * Column layout (0-indexed):
 *  0  front
 *  1  back
 *  2  article
 *  3  plural
 *  4  category
 *  5  exampleTarget
 *  6  exampleNative
 *  7  syn1Word
 *  8  syn1Article
 *  9  syn1Translation
 * 10  syn1Example
 * 11  syn1ExampleNative
 * 12  syn2Word
 *  … (same 5-column pattern, repeated up to 3 synonyms)
 */
const SYN_OFFSET = 7;
const SYN_STRIDE = 5;
const MAX_SYNONYMS = 3;

@Injectable({ providedIn: 'root' })
export class CsvParserService {
  parse(csvText: string, fileName: string, categories: Category[]): ParsedImportResult {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) {
      return { fileName, totalRows: 0, validRows: [], errorRows: [], warningCount: 0 };
    }

    const dataLines = lines.slice(1).filter(l => l.trim().length > 0);
    const validRows: ParsedImportRow[] = [];
    const errorRows: ParsedImportRow[] = [];
    let warningCount = 0;

    dataLines.forEach((line, idx) => {
      const cols = this.parseLine(line);
      const front          = (cols[0] ?? '').trim();
      const back           = (cols[1] ?? '').trim();
      const articleRaw     = (cols[2] ?? '').trim();
      const plural         = (cols[3] ?? '').trim() || null;
      const categoryName   = (cols[4] ?? '').trim();
      const exampleTarget  = (cols[5] ?? '').trim();
      const exampleNative  = (cols[6] ?? '').trim();

      const row: ParsedImportRow = {
        rowIndex: idx + 2,
        front,
        back,
        article: null,
        categoryId: '',
        exampleTarget,
        exampleNative,
        plural: plural || null,
        synonyms: [],
        status: 'valid',
        warningMessages: [],
        errorMessages: [],
      };

      if (!row.front) row.errorMessages.push('front is required');
      if (!row.back) row.errorMessages.push('back is required');
      if (row.errorMessages.length) {
        row.status = 'error';
        errorRows.push(row);
        return;
      }

      const artLower = articleRaw.toLowerCase();
      if (VALID_ARTICLES.has(artLower)) {
        row.article = artLower as ArticleType;
      } else if (artLower) {
        row.warningMessages.push(`Unknown article "${articleRaw}" — ignored`);
      }

      if (!row.exampleTarget) {
        row.warningMessages.push('No example sentence provided');
      }

      const catName = categoryName;
      if (catName) {
        const match = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        row.categoryId = match ? match.id : catName;
        if (!match) {
          row.warningMessages.push(`Category "${catName}" not found — will be unassigned`);
        }
      }

      // Parse synonym groups (up to MAX_SYNONYMS)
      const synonyms: Synonym[] = [];
      for (let s = 0; s < MAX_SYNONYMS; s++) {
        const base = SYN_OFFSET + s * SYN_STRIDE;
        const synWord = (cols[base] ?? '').trim();
        if (!synWord) continue;

        const synArtRaw = (cols[base + 1] ?? '').trim().toLowerCase();
        const synArticle: ArticleType | null = VALID_ARTICLES.has(synArtRaw)
          ? (synArtRaw as ArticleType)
          : null;

        synonyms.push({
          word: synWord,
          article: synArticle,
          translation: (cols[base + 2] ?? '').trim(),
          example: (cols[base + 3] ?? '').trim(),
          exampleNative: (cols[base + 4] ?? '').trim(),
        });
      }
      row.synonyms = synonyms;

      if (row.warningMessages.length) {
        row.status = 'warning';
        warningCount++;
      }

      validRows.push(row);
    });

    return { fileName, totalRows: dataLines.length, validRows, errorRows, warningCount };
  }

  private parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }
}
