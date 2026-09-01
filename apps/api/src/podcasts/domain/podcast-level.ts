import type { CefrLevel } from '@lingua-card/shared/domain';

const LEVEL_ORDER: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function isPodcastLevelRangeValid(minimum: CefrLevel, maximum: CefrLevel): boolean {
  return LEVEL_ORDER.indexOf(minimum) <= LEVEL_ORDER.indexOf(maximum);
}

export function isPodcastEpisodeLevelValid(
  level: CefrLevel,
  minimum: CefrLevel,
  maximum: CefrLevel,
): boolean {
  const levelIndex = LEVEL_ORDER.indexOf(level);
  return levelIndex >= LEVEL_ORDER.indexOf(minimum) && levelIndex <= LEVEL_ORDER.indexOf(maximum);
}
