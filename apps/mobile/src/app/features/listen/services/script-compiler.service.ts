import { Injectable } from '@angular/core';
import { AudioSegment, PlaybackScript, PlayMode } from '@lingua-card/shared/domain';
import {
  SilenceDuration,
  VocabularyPlaylistItem,
  VocabularyPlaylistLanguages,
} from '../models/listen.models';

@Injectable({ providedIn: 'root' })
export class ScriptCompilerService {
  compile(
    item: VocabularyPlaylistItem,
    mode: PlayMode,
    languages: VocabularyPlaylistLanguages,
  ): PlaybackScript {
    const segments: AudioSegment[] = [];

    const articleWord = item.article ? `${item.article} ${item.target}` : item.target;

    segments.push({ type: 'word_target', text: articleWord, language: languages.target });
    segments.push({
      type: 'silence',
      text: '',
      language: languages.target,
      durationMs: SilenceDuration.AfterWord,
    });
    segments.push({ type: 'word_native', text: item.native, language: languages.native });

    if (mode === 'wordsWithExamples' && item.example) {
      segments.push({
        type: 'silence',
        text: '',
        language: languages.target,
        durationMs: SilenceDuration.BeforeExample,
      });
      segments.push({
        type: 'example_target',
        text: item.example.target,
        language: languages.target,
      });
      segments.push({
        type: 'silence',
        text: '',
        language: languages.target,
        durationMs: SilenceDuration.BetweenExample,
      });
      segments.push({
        type: 'example_native',
        text: item.example.native,
        language: languages.native,
      });
    }

    segments.push({
      type: 'silence',
      text: '',
      language: languages.target,
      durationMs: SilenceDuration.AfterCard,
    });

    return { cardId: item.id, segments };
  }
}
