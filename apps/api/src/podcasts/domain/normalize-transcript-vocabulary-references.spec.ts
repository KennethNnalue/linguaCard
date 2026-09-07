import type { AdminPodcastTranscriptPayload } from '@lingua-card/shared/domain';
import { normalizeTranscriptVocabularyReferences } from './normalize-transcript-vocabulary-references';

function transcript(references: string[], keys = ['die-tuer', 'zu-machen']): AdminPodcastTranscriptPayload {
  return {
    schemaVersion: 1,
    speakers: [{ key: 'host', name: 'Carla', voiceGender: 'female' }],
    turns: [{ speakerKey: 'host', targetText: 'Jetzt mache ich die Tür zu.', translation: 'Now I close the door.', vocabularyRefs: references }],
    vocabulary: keys.map(key => ({ key, text: key, translation: key, importance: 'essential' })),
  };
}

describe('normalizeTranscriptVocabularyReferences', () => {
  it('accepts optional undeclared words and links German spelling variants to declared vocabulary', () => {
    const input = transcript(['fehlend', 'bald', 'zu-machen', 'die-tür']);
    const result = normalizeTranscriptVocabularyReferences(input);
    expect(result.turns[0].vocabularyRefs).toEqual(['zu-machen', 'die-tuer']);
    expect(result.turns[0].targetText).toBe(input.turns[0].targetText);
    expect(result.turns[0].translation).toBe(input.turns[0].translation);
    expect(result.vocabulary).toEqual(input.vocabulary);
    expect(input.turns[0].vocabularyRefs).toEqual(['fehlend', 'bald', 'zu-machen', 'die-tür']);
  });

  it('preserves turns with no declared vocabulary links', () => {
    expect(normalizeTranscriptVocabularyReferences(transcript(['bald', 'die-feier'])).turns[0].vocabularyRefs).toEqual([]);
  });

  it('deduplicates equivalent references and is stable across preview and commit', () => {
    const result = normalizeTranscriptVocabularyReferences(transcript(['die-tuer', 'die-tür', 'DIE-TÜR']));
    expect(result.turns[0].vocabularyRefs).toEqual(['die-tuer']);
    expect(normalizeTranscriptVocabularyReferences(result)).toEqual(result);
  });

  it('leaves ambiguous references and speaker keys for validation', () => {
    const input = transcript(['DIE-TÜR'], ['die-tuer', 'die-tür']);
    input.turns[0].speakerKey = 'missing-speaker';
    expect(normalizeTranscriptVocabularyReferences(input).turns[0]).toEqual(input.turns[0]);
  });
});
