import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { StoryGrammarNote } from '@lingua-card/shared/domain';

/** A run of text that is either plain or bold (from `**…**` markers). */
export interface TextSegment {
  text: string;
  bold: boolean;
}

@Component({
  selector: 'lc-grammar-tab',
  templateUrl: './grammar-tab.component.html',
  styleUrls: ['./grammar-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class GrammarTabComponent {
  readonly grammarNotes = input<StoryGrammarNote[]>([]);
  readonly loading = input<boolean>(false);

  /**
   * Split text on `**bold**` markers into rendered segments. Avoids `[innerHTML]`
   * (and the sanitiser round-trip) by letting the template render plain text and
   * `<strong>` natively — model output can never inject markup this way.
   */
  boldSegments(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const pattern = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), bold: false });
      }
      segments.push({ text: match[1], bold: true });
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), bold: false });
    }
    return segments;
  }
}
