import { Component, input } from '@angular/core';
import type { StoryGrammarNote } from '@lingua-card/shared/domain';

@Component({
  selector: 'lc-grammar-tab',
  templateUrl: './grammar-tab.component.html',
  styleUrls: ['./grammar-tab.component.scss'],
})
export class GrammarTabComponent {
  readonly grammarNotes = input<StoryGrammarNote[]>([]);
  readonly loading = input<boolean>(false);

  boldKeywords(text: string): string {
    // Bold any text wrapped in **...**
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
}
