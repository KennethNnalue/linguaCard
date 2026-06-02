import { Injectable } from '@angular/core';
import { AudioSegment, Card, PlaybackScript, PlayMode } from '@lingua-card/shared/domain';

@Injectable({ providedIn: 'root' })
export class ScriptCompilerService {
  compile(card: Card, mode: PlayMode): PlaybackScript {
    const segments: AudioSegment[] = [];

    const articleWord = card.content.article
      ? `${card.content.article} ${card.content.back}`
      : card.content.back;

    segments.push({ type: 'word_target', text: articleWord, lang: 'de' });
    segments.push({ type: 'silence', text: '', lang: 'de', durationMs: 600 });
    segments.push({ type: 'word_native', text: card.content.front, lang: 'en' });

    if (mode === 'examples' || mode === 'deepDive') {
      const example = card.content.examples?.[0];
      if (example) {
        segments.push({ type: 'silence', text: '', lang: 'de', durationMs: 900 });
        segments.push({ type: 'example_target', text: example.target, lang: 'de' });
        segments.push({ type: 'silence', text: '', lang: 'de', durationMs: 500 });
        segments.push({ type: 'example_native', text: example.native, lang: 'en' });
      }
    }

    if (mode === 'deepDive' && card.content.notes) {
      segments.push({ type: 'silence', text: '', lang: 'en', durationMs: 700 });
      segments.push({ type: 'grammar_tip', text: card.content.notes, lang: 'en' });
    }

    segments.push({ type: 'silence', text: '', lang: 'de', durationMs: 1200 });

    return { cardId: card.id, segments };
  }
}
