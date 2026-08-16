export type LearningStage = 'new' | 'learning' | 'familiar' | 'strong' | 'mastered';

export interface ReviewCommittedEvent {
  type: 'ReviewCommitted';
  schemaVersion: 1;
  eventId: string;
  reviewId: string;
  attemptId: string;
  cardId: string;
  sessionId: string;
  reviewedAt: Date;
  mode: 'typing' | 'recall';
  direction: 'source_to_target' | 'target_to_source';
  responseType: 'self_rated' | 'typed_answer' | 'dont_know';
  rating: 'again' | 'hard' | 'good' | 'easy';
  stageBefore: LearningStage;
  stageAfter: LearningStage;
  intervalBeforeMinutes?: number;
  intervalAfterMinutes?: number;
  becameMastered: boolean;
  lostMastery: boolean;
  becameLeech: boolean;
  recoveredFromLeech: boolean;
  wasRelearning: boolean;
}
