export type ReviewAutoplayMode = 'off' | 'answer' | 'answer_and_example';

export interface ReviewAudioPolicyInput {
  mode: ReviewAutoplayMode;
  muted: boolean;
  documentVisible: boolean;
  saveData: boolean;
}

export function shouldAutoplayReviewAnswer(input: ReviewAudioPolicyInput): boolean {
  return input.mode !== 'off' && !input.muted && input.documentVisible && !input.saveData;
}

export function shouldAutoplayFirstExample(input: ReviewAudioPolicyInput): boolean {
  return input.mode === 'answer_and_example' && shouldAutoplayReviewAnswer(input);
}
