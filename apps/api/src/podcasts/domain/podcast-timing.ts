import type { PodcastWordTiming } from '@lingua-card/shared/domain';
import type {
  ElevenLabsAlignedWord, ElevenLabsAlignment, ElevenLabsVoiceSegment,
} from '../infrastructure/elevenlabs-dialogue.adapter';

export interface PodcastTurnTiming {
  turnIndex: number;
  startMs: number;
  endMs: number;
  words: PodcastWordTiming[];
}

export function normalizePodcastTimings(
  turnCount: number,
  alignment: ElevenLabsAlignment,
  segments: ElevenLabsVoiceSegment[],
): PodcastTurnTiming[] {
  const timings: PodcastTurnTiming[] = [];
  for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
    const turnSegments = segments.filter(segment => segment.dialogueInputIndex === turnIndex);
    if (!turnSegments.length) continue;
    const characterStart = Math.min(...turnSegments.map(segment => segment.characterStartIndex));
    const characterEnd = Math.max(...turnSegments.map(segment => segment.characterEndIndex));
    const startMs = secondsToMs(Math.min(...turnSegments.map(segment => segment.startTimeSeconds)));
    const endMs = secondsToMs(Math.max(...turnSegments.map(segment => segment.endTimeSeconds)));
    timings.push({
      turnIndex, startMs, endMs,
      words: wordsFromCharacterAlignment(alignment, characterStart, characterEnd),
    });
  }
  return timings;
}

export function dialogueDurationMs(
  alignment: ElevenLabsAlignment,
  segments: ElevenLabsVoiceSegment[],
): number {
  const alignmentEnd = alignment.characterEndTimesSeconds.at(-1) ?? 0;
  const segmentEnd = segments.reduce((maximum, segment) => Math.max(maximum, segment.endTimeSeconds), 0);
  return secondsToMs(Math.max(alignmentEnd, segmentEnd));
}

export function normalizeForcedAlignmentTimings(
  turnTexts: readonly string[],
  alignedWords: readonly ElevenLabsAlignedWord[],
): PodcastTurnTiming[] {
  const expectedWordCounts = turnTexts.map(text => [...text.matchAll(/\S+/gu)].length);
  const expectedTotal = expectedWordCounts.reduce((total, count) => total + count, 0);
  if (expectedTotal !== alignedWords.length) return [];
  const timings: PodcastTurnTiming[] = [];
  let wordOffset = 0;
  for (let turnIndex = 0; turnIndex < expectedWordCounts.length; turnIndex += 1) {
    const count = expectedWordCounts[turnIndex];
    const turnWords = alignedWords.slice(wordOffset, wordOffset + count);
    wordOffset += count;
    if (!turnWords.length) continue;
    timings.push({
      turnIndex,
      startMs: secondsToMs(turnWords[0].startTimeSeconds),
      endMs: secondsToMs(turnWords.at(-1)?.endTimeSeconds ?? 0),
      words: turnWords.map(word => ({
        text: word.text,
        startMs: secondsToMs(word.startTimeSeconds),
        endMs: secondsToMs(word.endTimeSeconds),
      })),
    });
  }
  return timings;
}

function wordsFromCharacterAlignment(
  alignment: ElevenLabsAlignment,
  characterStart: number,
  characterEnd: number,
): PodcastWordTiming[] {
  const text = alignment.characters.slice(characterStart, characterEnd).join('');
  const words: PodcastWordTiming[] = [];
  for (const match of text.matchAll(/\S+/gu)) {
    const localStart = match.index;
    const localEnd = localStart + match[0].length - 1;
    const globalStart = characterStart + localStart;
    const globalEnd = characterStart + localEnd;
    const startSeconds = alignment.characterStartTimesSeconds[globalStart];
    const endSeconds = alignment.characterEndTimesSeconds[globalEnd];
    if (startSeconds === undefined || endSeconds === undefined) continue;
    words.push({ text: match[0], startMs: secondsToMs(startSeconds), endMs: secondsToMs(endSeconds) });
  }
  return words;
}

function secondsToMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}
