// Re-export barrel — all types and mock data are now in shared libs.
// Import directly from the libs in new code:
//   import type { Card } from '@lingua-card/shared/domain';
//   import { MOCK_CARDS } from '@lingua-card/shared/testing';
export * from '@lingua-card/shared/domain';
export * from '@lingua-card/shared/testing';
