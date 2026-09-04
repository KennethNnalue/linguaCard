export function podcastExternalId(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 100)
    .replace(/-+$/gu, '');
  return normalized || 'podcast';
}

export function podcastEpisodeExternalId(
  topicExternalId: string,
  title: string,
  position: number,
): string {
  const sequence = String(position + 1).padStart(2, '0');
  const titleId = podcastExternalId(title);
  return `${topicExternalId}-${sequence}-${titleId}`.slice(0, 120).replace(/-+$/gu, '');
}
