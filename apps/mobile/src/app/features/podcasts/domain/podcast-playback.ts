import type { PodcastPlayerTurn } from '@lingua-card/shared/domain';

export function findPodcastTurnAtTime(
  turns: readonly PodcastPlayerTurn[],
  currentTimeMs: number,
): PodcastPlayerTurn | null {
  if (!turns.length) return null;
  const activeTurn = turns.find(
    turn => currentTimeMs >= turn.startMs && currentTimeMs < turn.endMs,
  );
  if (activeTurn) return activeTurn;
  if (currentTimeMs < turns[0].startMs) return turns[0];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (currentTimeMs >= turns[index].startMs) return turns[index];
  }
  return turns[0];
}
