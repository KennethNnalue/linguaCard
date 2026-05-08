import { Injectable } from '@angular/core';
import {
  ArticleType,
  Category,
  ParsedImportResult,
  ParsedImportRow,
} from '../models/mock-data';

const VALID_ARTICLES = new Set(['der', 'die', 'das']);

@Injectable({ providedIn: 'root' })
export class CsvImportService {
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
      const [front = '', back = '', article = '', categoryName = '', exampleTarget = '', exampleNative = ''] = cols;

      const row: ParsedImportRow = {
        rowIndex: idx + 2,
        front: front.trim(),
        back: back.trim(),
        article: null,
        categoryId: '',
        exampleTarget: exampleTarget.trim(),
        exampleNative: exampleNative.trim(),
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

      const artLower = article.trim().toLowerCase();
      if (VALID_ARTICLES.has(artLower)) {
        row.article = artLower as ArticleType;
      } else if (artLower) {
        row.warningMessages.push(`Unknown article "${article}" — ignored`);
      }

      if (!row.exampleTarget) {
        row.warningMessages.push('No example sentence provided');
      }

      const catName = categoryName.trim();
      if (catName) {
        const match = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        row.categoryId = match ? match.id : catName;
        if (!match) {
          row.warningMessages.push(`Category "${catName}" not found — will be unassigned`);
        }
      }

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
