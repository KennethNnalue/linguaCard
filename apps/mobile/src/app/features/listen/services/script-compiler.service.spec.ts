import { ScriptCompilerService } from './script-compiler.service';
import { VocabularyPlaylistItem } from '../models/listen.models';

function item(overrides: Partial<VocabularyPlaylistItem> = {}): VocabularyPlaylistItem {
  return {
    id: 'word-1',
    article: 'die',
    target: 'Birne',
    native: 'pear',
    example: {
      target: 'Die Birne schmeckt gut.',
      native: 'The pear tastes good.',
    },
    categoryIds: [],
    learningStage: 'new',
    ...overrides,
  };
}

describe('ScriptCompilerService', () => {
  const compiler = new ScriptCompilerService();
  const languages = { target: 'de-DE', native: 'en-US' };

  it('speaks the target word and native meaning in words mode', () => {
    const script = compiler.compile(item(), 'words', languages);

    expect(script.segments.filter(segment => segment.type !== 'silence')).toEqual([
      { type: 'word_target', text: 'die Birne', language: 'de-DE' },
      { type: 'word_native', text: 'pear', language: 'en-US' },
    ]);
  });

  it('speaks both bilingual example segments in words-with-examples mode', () => {
    const script = compiler.compile(item(), 'wordsWithExamples', languages);

    expect(script.segments.filter(segment => segment.type !== 'silence')).toEqual([
      { type: 'word_target', text: 'die Birne', language: 'de-DE' },
      { type: 'word_native', text: 'pear', language: 'en-US' },
      { type: 'example_target', text: 'Die Birne schmeckt gut.', language: 'de-DE' },
      { type: 'example_native', text: 'The pear tastes good.', language: 'en-US' },
    ]);
  });

  it('skips examples when the item has no bilingual example', () => {
    const script = compiler.compile(item({ example: null }), 'wordsWithExamples', languages);

    expect(script.segments.some(segment => segment.type === 'example_target')).toBe(false);
    expect(script.segments.some(segment => segment.type === 'example_native')).toBe(false);
  });
});
