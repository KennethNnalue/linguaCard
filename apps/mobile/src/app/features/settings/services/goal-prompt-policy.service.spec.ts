import { Preferences } from '@capacitor/preferences';
import { GoalPromptPolicyService } from './goal-prompt-policy.service';

jest.mock('@capacitor/preferences', () => ({
  Preferences: { get: jest.fn(), set: jest.fn() },
}));

describe('GoalPromptPolicyService', () => {
  const service = new GoalPromptPolicyService();

  afterEach(() => jest.clearAllMocks());

  test('allows the first prompt', async () => {
    jest.mocked(Preferences.get).mockResolvedValue({ value: null });

    await expect(service.shouldShow('user-1')).resolves.toBe(true);
  });

  test('suppresses the prompt until seven days have elapsed', async () => {
    const shownAt = new Date('2026-08-10T08:00:00.000Z');
    jest.mocked(Preferences.get).mockResolvedValue({ value: shownAt.toISOString() });

    await expect(service.shouldShow('user-1', shownAt.getTime() + 6 * 86_400_000)).resolves.toBe(false);
    await expect(service.shouldShow('user-1', shownAt.getTime() + 7 * 86_400_000)).resolves.toBe(true);
  });

  test('stores prompt timestamps separately for each user', async () => {
    const set = jest.mocked(Preferences.set).mockResolvedValue();
    const shownAt = new Date('2026-08-17T08:00:00.000Z');

    await service.markShown('user-1', shownAt);

    expect(set).toHaveBeenCalledWith({
      key: 'lc_goal_prompt_last_shown:user-1',
      value: shownAt.toISOString(),
    });
  });
});
