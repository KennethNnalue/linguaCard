export interface RecallSelection {
  start: number;
  end: number;
}

export function canSubmitRecallAnswer(answer: string): boolean {
  return answer.trim().length > 0;
}

export function insertRecallCharacter(
  answer: string,
  character: string,
  selection: RecallSelection,
): { answer: string; caret: number } {
  const start = Math.min(answer.length, Math.max(0, selection.start));
  const end = Math.min(answer.length, Math.max(start, selection.end));
  return {
    answer: `${answer.slice(0, start)}${character}${answer.slice(end)}`,
    caret: start + character.length,
  };
}
