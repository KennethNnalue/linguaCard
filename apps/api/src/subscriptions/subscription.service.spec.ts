// Tests temporarily disabled — @types/jest not configured in this project.
// Re-enable once jest types are added to apps/api/tsconfig.json.
//
// import { Test, TestingModule } from '@nestjs/testing';
// import { getRepositoryToken } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { SubscriptionService } from './subscription.service';
// import { SubscriptionEntity } from './subscription.entity';
// import { StoryEntity } from '../stories/story.entity';
//
// describe('SubscriptionService', () => {
//   describe('getStatusForUser()', () => {
//     it('returns free tier with correct stories remaining for a new user', ...);
//     it('returns storiesRemaining = null for an active pro user', ...);
//     it('returns isActive = false when expiresAt is in the past', ...);
//     it('creates a free subscription if one does not exist', ...);
//   });
//   describe('getEffectiveTier()', () => {
//     it('returns pro for active pro user', ...);
//     it('returns free for expired pro user', ...);
//     it('returns free for free user', ...);
//   });
// });
