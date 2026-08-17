import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const PROMPT_KEY_PREFIX = 'lc_goal_prompt_last_shown';

@Injectable({ providedIn: 'root' })
export class GoalPromptPolicyService {
  async shouldShow(userId: string, now = Date.now()): Promise<boolean> {
    const { value } = await Preferences.get({ key: this.key(userId) });
    if (!value) return true;
    const lastShownAt = new Date(value).getTime();
    return !Number.isFinite(lastShownAt) || now - lastShownAt >= PROMPT_INTERVAL_MS;
  }

  async markShown(userId: string, shownAt = new Date()): Promise<void> {
    await Preferences.set({ key: this.key(userId), value: shownAt.toISOString() });
  }

  private key(userId: string): string {
    return `${PROMPT_KEY_PREFIX}:${userId}`;
  }
}
