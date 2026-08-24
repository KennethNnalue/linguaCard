import { describe, expect, it } from '@jest/globals';
import { LexemeIdentityService } from './lexeme-identity.service';

describe('LexemeIdentityService', () => {
  const service = new LexemeIdentityService();

  it('maps German locale aliases and normalizes whitespace without removing umlauts', () => {
    expect(service.createIdentity({ language: 'de-DE', text: '  die   Bahnhöfe  ', partOfSpeech: 'noun' }))
      .toEqual({
        language: 'de',
        normalizedLemma: 'bahnhöfe',
        displayText: 'Bahnhöfe',
        partOfSpeech: 'noun',
        grammarDiscriminator: 'article=die;gender=',
      });
  });

  it('uses structured German grammar when the article is not included in display text', () => {
    expect(service.createIdentity({
      language: 'de',
      text: 'Band',
      partOfSpeech: 'noun',
      grammar: { article: 'das', gender: 'neuter' },
    })).toEqual({
      language: 'de',
      normalizedLemma: 'band',
      displayText: 'Band',
      partOfSpeech: 'noun',
      grammarDiscriminator: 'article=das;gender=neuter',
    });
  });

  it('keeps German noun homographs distinct by grammar', () => {
    const masculine = service.createIdentity({
      language: 'de', text: 'Band', partOfSpeech: 'noun', grammar: { article: 'der' },
    });
    const neuter = service.createIdentity({
      language: 'de', text: 'Band', partOfSpeech: 'noun', grammar: { article: 'das' },
    });

    expect(masculine.normalizedLemma).toBe(neuter.normalizedLemma);
    expect(masculine.grammarDiscriminator).not.toBe(neuter.grammarDiscriminator);
  });

  it('keeps accents because they can distinguish lexemes', () => {
    const accented = service.createIdentity({ language: 'es', text: 'sí' });
    const unaccented = service.createIdentity({ language: 'es', text: 'si' });

    expect(accented.normalizedLemma).not.toBe(unaccented.normalizedLemma);
  });

  it('rejects empty lexeme text', () => {
    expect(() => service.createIdentity({ language: 'de', text: '   ' }))
      .toThrow('Lexeme text is required');
  });
});
