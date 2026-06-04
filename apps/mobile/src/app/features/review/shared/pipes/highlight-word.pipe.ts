import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'highlightWord', pure: true })
export class HighlightWordPipe implements PipeTransform {
  transform(sentence: string, word: string): string {
    if (!sentence || !word) return sentence;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return sentence.replace(new RegExp(`(${escaped})`, 'gi'), '<strong>$1</strong>');
  }
}
