export interface RewardPolicy {
  firstDailyCardReviewPoints: number;
  dailyGoalCompletionPoints: number;
  earnedMasteryPoints: number;
}
export const DEFAULT_REWARD_POLICY: RewardPolicy = {
  firstDailyCardReviewPoints: 2,
  dailyGoalCompletionPoints: 10,
  earnedMasteryPoints: 5,
};
