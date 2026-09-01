import { HttpErrorResponse } from '@angular/common/http';

export function adminPodcastErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;

  const response = error.error;
  if (isRecord(response)) {
    const message = response['message'];
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.every(item => typeof item === 'string')) {
      return message.join(' ');
    }
  }

  return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
