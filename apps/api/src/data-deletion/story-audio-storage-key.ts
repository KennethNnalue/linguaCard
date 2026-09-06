export function storyAudioStorageKey(audioUrl: string): string | null {
  try {
    const pathname = new URL(audioUrl).pathname
      .replace(/^\/uploads\//, '')
      .replace(/^\//, '');
    return pathname.startsWith('stories/') && pathname.length > 'stories/'.length
      ? pathname
      : null;
  } catch {
    return null;
  }
}
