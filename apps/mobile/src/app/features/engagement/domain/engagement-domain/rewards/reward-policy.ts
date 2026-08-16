export interface RewardPolicy {
  firstDailyCardReviewPoints: number;
  dailyGoalCompletionPoints: number;
  earnedMasteryPoints: number;
}
export const DEFAULT_REWARD_POLICY: RewardPolicy = {
  firstDailyCardReviewPoints: 1,
  dailyGoalCompletionPoints: 10,
  earnedMasteryPoints: 5,
};
