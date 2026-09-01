import { HttpErrorResponse } from '@angular/common/http';
import { adminPodcastErrorMessage } from './admin-podcast-error';

describe('adminPodcastErrorMessage', () => {
  test('shows the API conflict message', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { message: 'Podcast topic externalId at-the-cafe already exists' },
    });

    expect(adminPodcastErrorMessage(error, 'Could not create the topic.')).toBe(
      'Podcast topic externalId at-the-cafe already exists',
    );
  });

  test('joins validation messages', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { message: ['externalId must match the required pattern', 'title must not be empty'] },
    });

    expect(adminPodcastErrorMessage(error, 'Could not create the topic.')).toBe(
      'externalId must match the required pattern title must not be empty',
    );
  });

  test('adds the HTTP status when the API has no useful message', () => {
    const error = new HttpErrorResponse({ status: 503 });

    expect(adminPodcastErrorMessage(error, 'Could not load podcast topics.')).toBe(
      'Could not load podcast topics. (HTTP 503)',
    );
  });
});
