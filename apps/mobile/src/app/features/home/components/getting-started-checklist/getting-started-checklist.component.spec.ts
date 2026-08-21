import { nextIncompleteChecklistItem } from './getting-started-checklist.component';

describe('nextIncompleteChecklistItem', () => {
  test('returns only the first unfinished onboarding action', () => {
    const result = nextIncompleteChecklistItem([
      { labelKey: 'add-word', completed: true, route: '/vault' },
      { labelKey: 'first-review', completed: false, route: '/review' },
      { labelKey: 'first-story', completed: false, route: '/stories' },
    ]);

    expect(result).toEqual({ labelKey: 'first-review', completed: false, route: '/review' });
  });

  test('returns null after every onboarding action is complete', () => {
    expect(nextIncompleteChecklistItem([
      { labelKey: 'add-word', completed: true, route: '/vault' },
    ])).toBeNull();
  });
});
