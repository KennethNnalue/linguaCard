import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { SpeechIdentity, SpeechIdentityInput } from '../models/vocabulary.types';
import { canonicalizeLanguageCode } from './language-code';

@Injectable()
export class SpeechIdentityService {
  createIdentity(input: SpeechIdentityInput): SpeechIdentity {
    const language = canonicalizeLanguageCode(input.language);
    const displayText = input.text.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (!displayText) throw new Error('Speech text is required');
    if (!input.voiceKey.trim()) throw new Error('Speech voice key is required');
    if (!Number.isInteger(input.profileVersion) || input.profileVersion < 1) {
      throw new Error('Speech profile version must be a positive integer');
    }

    const normalizedText = displayText
      .toLocaleLowerCase(language)
      .replace(/[\p{P}\p{S}]+(?=\s|$)/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    const voiceKey = input.voiceKey.trim();
    const rawIdentity = [
      language,
      normalizedText,
      voiceKey,
      String(input.profileVersion),
    ].join('\u0000');

    return {
      identityKey: createHash('sha256').update(rawIdentity).digest('hex'),
      language,
      normalizedText,
      displayText,
      voiceKey,
      profileVersion: input.profileVersion,
      contentKind: input.contentKind,
    };
  }
}
