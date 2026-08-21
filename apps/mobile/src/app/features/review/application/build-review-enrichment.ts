import type { CardContent } from '@lingua-card/shared/domain';

export type ReviewEnrichmentTab = 'examples' | 'synonyms';

export interface ReviewEnrichmentView {
  tabs: readonly ReviewEnrichmentTab[];
  initialTab: ReviewEnrichmentTab | null;
}

export function buildReviewEnrichment(content: CardContent): ReviewEnrichmentView {
  const tabs: ReviewEnrichmentTab[] = [];
  // The first example is already the primary usage example above the tabs.
  // Only expose Examples when there is additional example content to explore.
  if (content.examples.length > 1) tabs.push('examples');
  if (content.synonyms.length > 0) tabs.push('synonyms');
  return { tabs, initialTab: tabs[0] ?? null };
}

export function nextReviewEnrichmentTab(
  tabs: readonly ReviewEnrichmentTab[],
  current: ReviewEnrichmentTab,
  direction: 1 | -1,
): ReviewEnrichmentTab {
  if (tabs.length === 0) return current;
  const currentIndex = Math.max(0, tabs.indexOf(current));
  return tabs[(currentIndex + direction + tabs.length) % tabs.length];
}
