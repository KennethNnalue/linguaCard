import type {
  ArticleSystem,
  LearningContext,
  Collection,
  User,
  UserPreferences,
  Deck,
  Category,
  Card,
  SRSStateData,
  ProgressStats,
  ReviewSession,
  ConfidenceRating,
  MasteryLevel,
} from '@lingua-card/shared/domain';

// ─── ARTICLE COLOUR SYSTEM ────────────────────────────────────────────────────

export const GERMAN_ARTICLE_SYSTEM: ArticleSystem = {
  language: 'de',
  articles: [
    { article: 'der', gender: 'masculine', bgColour: '#EAF2FC', textColour: '#1A56A3', borderColour: '#85B7EB', cssClass: 'article--der' },
    { article: 'die', gender: 'feminine',  bgColour: '#FEF2F2', textColour: '#B91C1C', borderColour: '#FCA5A5', cssClass: 'article--die' },
    { article: 'das', gender: 'neuter',    bgColour: '#F1EFE8', textColour: '#5F5E5A', borderColour: '#B4B2A9', cssClass: 'article--das' },
  ],
};

// ─── LEARNING CONTEXT ─────────────────────────────────────────────────────────

export const GERMAN_VOCAB_CONTEXT: LearningContext = {
  id: 'german-vocab',
  name: 'German Vocabulary',
  description: 'Learn German words with grammatical gender and example sentences.',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  flagEmoji: '🇩🇪',
  articleSystem: GERMAN_ARTICLE_SYSTEM,
  ttsVoice: 'de-DE-KatjaNeural',
  defaultSRSConfig: {
    algorithm: 'sm2',
    newCardsPerDay: 10,
    reviewsPerDay: 50,
    intervalModifier: 1.0,
    easeBonus: 1.3,
    hardInterval: 1.2,
    minimumEaseFactor: 1.3,
    startingEaseFactor: 2.5,
  },
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

export const MOCK_COLLECTIONS: Collection[] = [
  {
    id: 'col-001', userId: 'user-001', name: 'Chapter 6 — Restaurant',
    description: 'Vocabulary from Netzwerk chapter 6, covering food, ordering and events.',
    emoji: '🇩🇪', colour: '#2D5A4E', contextId: 'german-vocab',
    cardCount: 19, masteredCount: 4, dueCount: 8,
    createdAt: '2025-05-01T09:00:00Z', updatedAt: '2025-05-07T09:00:00Z', isDefault: false,
  },
  {
    id: 'col-002', userId: 'user-001', name: 'Chapter 3 — Family',
    description: 'Family and animals vocabulary from chapter 3.',
    emoji: '🇩🇪', colour: '#2D5A4E', contextId: 'german-vocab',
    cardCount: 5, masteredCount: 1, dueCount: 4,
    createdAt: '2025-04-15T09:00:00Z', updatedAt: '2025-05-06T09:00:00Z', isDefault: false,
  },
  {
    id: 'col-003', userId: 'user-001', name: 'My custom words',
    description: '', emoji: '📚', colour: '#2D5A4E', contextId: 'german-vocab',
    cardCount: 0, masteredCount: 0, dueCount: 0,
    createdAt: '2025-05-07T09:00:00Z', updatedAt: '2025-05-07T09:00:00Z', isDefault: true,
  },
];

export const MOCK_USER: User = {
  id: 'user-001', email: 'jan@example.com', name: 'Jan Schmidt',
  avatarInitials: 'JS', createdAt: '2025-01-15T09:00:00Z',
};

export const MOCK_USER_PREFERENCES: UserPreferences = {
  userId: 'user-001', theme: 'system', activeContextId: 'german-vocab',
  autoPlayAudio: true, playbackSpeed: 1.0, showPhonetics: true,
  dailyGoalCards: 20, notificationsEnabled: true, reminderTime: '08:00',
};

export const MOCK_DECK: Deck = {
  id: 'deck-001', userId: 'user-001', contextId: 'german-vocab',
  name: 'My German Vocabulary', description: 'Personal vocabulary deck for everyday German',
  cardCount: 127, isDefault: true, createdAt: '2025-01-15T09:00:00Z',
};

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-001', userId: 'user-001', name: 'Animals',    colour: '#E07B3F', cardCount: 18, createdAt: '2025-01-15T09:00:00Z' },
  { id: 'cat-002', userId: 'user-001', name: 'Food',       colour: '#E07B3F', cardCount: 24, createdAt: '2025-01-15T09:00:00Z' },
  { id: 'cat-003', userId: 'user-001', name: 'Travel',     colour: '#1A56A3', cardCount: 15, createdAt: '2025-01-16T09:00:00Z' },
  { id: 'cat-004', userId: 'user-001', name: 'Daily Life', colour: '#2D5A4E', cardCount: 31, createdAt: '2025-01-17T09:00:00Z' },
  { id: 'cat-005', userId: 'user-001', name: 'Family',     colour: '#B91C1C', cardCount: 12, createdAt: '2025-01-18T09:00:00Z' },
  { id: 'cat-006', userId: 'user-001', name: 'Home',       colour: '#5F5E5A', cardCount: 9,  createdAt: '2025-01-19T09:00:00Z' },
  { id: 'cat-007', userId: 'user-001', name: 'Work',       colour: '#7C3AED', cardCount: 11, createdAt: '2025-01-20T09:00:00Z' },
  { id: 'cat-008', userId: 'user-001', name: 'Nature',     colour: '#059669', cardCount: 7,  createdAt: '2025-01-21T09:00:00Z' },
];

// ─── CARD FACTORY HELPERS ─────────────────────────────────────────────────────

export function makeSrsState(cardId: string, overrides: Partial<SRSStateData> = {}): SRSStateData {
  const now = new Date().toISOString();
  return {
    id: `srs-${cardId}`,
    cardId,
    userId: 'user-001',
    algorithm: 'sm2',
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 0,
    lastRating: null,
    lastReviewedAt: null,
    nextDueAt: now,
    masteryLevel: 0,
    state: 'new',
    ...overrides,
  };
}

// ─── RATING / MASTERY CONFIG ──────────────────────────────────────────────────

export const SM2_RATING_CONFIG: Record<ConfidenceRating, { label: string; description: string; colour: string }> = {
  0: { label: 'Blank',  description: 'No memory at all',            colour: '#D1D5DB' },
  1: { label: 'Hard',   description: 'Barely recalled',             colour: '#FCA5A5' },
  2: { label: 'Hmm',    description: 'Recalled with effort',        colour: '#FCD34D' },
  3: { label: 'Good',   description: 'Recalled correctly',          colour: '#6EE7B7' },
  4: { label: 'Easy',   description: 'Recalled without hesitation', colour: '#34D399' },
  5: { label: 'Nailed', description: 'Instant, effortless recall',  colour: '#059669' },
};

export const MASTERY_CONFIG: Record<MasteryLevel, { label: string; colour: string; cssClass: string }> = {
  0: { label: 'New',      colour: '#D1D5DB', cssClass: 'mastery--0' },
  1: { label: 'Beginner', colour: '#FCA5A5', cssClass: 'mastery--1' },
  2: { label: 'Learning', colour: '#FCD34D', cssClass: 'mastery--2' },
  3: { label: 'Familiar', colour: '#6EE7B7', cssClass: 'mastery--3' },
  4: { label: 'Good',     colour: '#34D399', cssClass: 'mastery--4' },
  5: { label: 'Mastered', colour: '#059669', cssClass: 'mastery--5' },
};

// ─── MOCK CARDS ───────────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString();
}
function daysAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
}

export const MOCK_CARDS: Card[] = [
  {
    id: 'card-001', deckId: 'deck-001', collectionId: 'col-002', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-001'], tags: ['noun', 'animal'], version: 3,
    createdAt: '2025-01-15T10:00:00Z', updatedAt: '2025-01-15T10:00:00Z',
    content: { front: 'the cat', back: 'Katze', article: 'die', gender: 'feminine', phonetic: '/ˈkat.sə/', examples: [
      { id: 'ex-001a', target: 'Die Katze sitzt auf dem Sofa.', native: 'The cat is sitting on the sofa.' },
      { id: 'ex-001b', target: 'Meine Katze heißt Luna.', native: 'My cat is called Luna.' },
    ], notes: 'Always feminine. Plural: die Katzen.', audioAssetId: 'audio-001', imageUrl: null },
    srsState: makeSrsState('card-001', { masteryLevel: 5, state: 'mastered', intervalDays: 30, repetitions: 8, lastRating: 5, lastReviewedAt: daysAgo(2), nextDueAt: daysFromNow(28) }),
  },
  {
    id: 'card-002', deckId: 'deck-001', collectionId: 'col-002', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-001'], tags: ['noun', 'animal'], version: 2,
    createdAt: '2025-01-15T10:05:00Z', updatedAt: '2025-01-15T10:05:00Z',
    content: { front: 'the dog', back: 'Hund', article: 'der', gender: 'masculine', phonetic: '/hʊnt/', examples: [
      { id: 'ex-002a', target: 'Der Hund bellt laut.', native: 'The dog barks loudly.' },
    ], notes: 'Masculine. Plural: die Hunde.', audioAssetId: 'audio-002', imageUrl: null },
    srsState: makeSrsState('card-002', { masteryLevel: 4, state: 'review', intervalDays: 14, repetitions: 5, lastRating: 4, lastReviewedAt: daysAgo(10), nextDueAt: daysFromNow(4) }),
  },
  {
    id: 'card-003', deckId: 'deck-001', collectionId: 'col-002', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-001'], tags: ['noun', 'animal'], version: 1,
    createdAt: '2025-01-16T09:00:00Z', updatedAt: '2025-01-16T09:00:00Z',
    content: { front: 'the bird', back: 'Vogel', article: 'der', gender: 'masculine', phonetic: '/ˈfoː.ɡəl/', examples: [
      { id: 'ex-003a', target: 'Der Vogel singt im Baum.', native: 'The bird is singing in the tree.' },
    ], notes: 'Masculine. Plural: die Vögel (umlaut changes!).', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-003', { masteryLevel: 2, state: 'learning', intervalDays: 4, repetitions: 2, lastRating: 2, lastReviewedAt: daysAgo(1), nextDueAt: daysFromNow(0) }),
  },
  {
    id: 'card-004', deckId: 'deck-001', collectionId: 'col-002', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-001'], tags: ['noun', 'animal'], version: 1,
    createdAt: '2025-01-16T09:10:00Z', updatedAt: '2025-01-16T09:10:00Z',
    content: { front: 'the horse', back: 'Pferd', article: 'das', gender: 'neuter', phonetic: '/p͡feːɐ̯t/', examples: [
      { id: 'ex-004a', target: 'Das Pferd läuft schnell.', native: 'The horse runs fast.' },
    ], notes: 'Neuter. Plural: die Pferde.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-004', { masteryLevel: 0, state: 'new', nextDueAt: new Date().toISOString() }),
  },
  {
    id: 'card-005', deckId: 'deck-001', collectionId: 'col-002', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-001'], tags: ['noun', 'animal'], version: 2,
    createdAt: '2025-01-17T08:00:00Z', updatedAt: '2025-01-17T08:00:00Z',
    content: { front: 'the fish', back: 'Fisch', article: 'der', gender: 'masculine', phonetic: '/fɪʃ/', examples: [
      { id: 'ex-005a', target: 'Der Fisch schwimmt im Wasser.', native: 'The fish swims in the water.' },
    ], notes: 'Masculine. Plural: die Fische.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-005', { masteryLevel: 1, state: 'learning', intervalDays: 2, repetitions: 1, lastRating: 1, lastReviewedAt: daysAgo(1), nextDueAt: new Date().toISOString() }),
  },
  {
    id: 'card-006', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-002'], tags: ['noun', 'food'], version: 2,
    createdAt: '2025-01-17T10:00:00Z', updatedAt: '2025-01-17T10:00:00Z',
    content: { front: 'the bread', back: 'Brot', article: 'das', gender: 'neuter', phonetic: '/bʁoːt/', examples: [
      { id: 'ex-006a', target: 'Das Brot ist frisch gebacken.', native: 'The bread is freshly baked.' },
    ], notes: 'Neuter. Plural: die Brote.', audioAssetId: 'audio-006', imageUrl: null },
    srsState: makeSrsState('card-006', { masteryLevel: 5, state: 'mastered', intervalDays: 21, repetitions: 7, lastRating: 5, lastReviewedAt: daysAgo(5), nextDueAt: daysFromNow(16) }),
  },
  {
    id: 'card-007', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-002'], tags: ['noun', 'food', 'drink'], version: 1,
    createdAt: '2025-01-18T09:00:00Z', updatedAt: '2025-01-18T09:00:00Z',
    content: { front: 'the water', back: 'Wasser', article: 'das', gender: 'neuter', phonetic: '/ˈvas.ɐ/', examples: [
      { id: 'ex-007a', target: 'Ich trinke ein Glas Wasser.', native: 'I am drinking a glass of water.' },
    ], notes: 'Neuter. Uncountable in most contexts.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-007', { masteryLevel: 3, state: 'review', intervalDays: 7, repetitions: 3, lastRating: 3, lastReviewedAt: daysAgo(5), nextDueAt: daysFromNow(2) }),
  },
  {
    id: 'card-008', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-002'], tags: ['noun', 'food'], version: 2,
    createdAt: '2025-01-18T10:00:00Z', updatedAt: '2025-01-18T10:00:00Z',
    content: { front: 'the apple', back: 'Apfel', article: 'der', gender: 'masculine', phonetic: '/ˈap.fəl/', examples: [
      { id: 'ex-008a', target: 'Der Apfel ist rot und süß.', native: 'The apple is red and sweet.' },
    ], notes: 'Masculine. Plural: die Äpfel (umlaut!).', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-008', { masteryLevel: 4, state: 'review', intervalDays: 10, repetitions: 4, lastRating: 4, lastReviewedAt: daysAgo(8), nextDueAt: daysFromNow(2) }),
  },
  {
    id: 'card-009', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-002'], tags: ['noun', 'food', 'drink'], version: 1,
    createdAt: '2025-01-19T08:00:00Z', updatedAt: '2025-01-19T08:00:00Z',
    content: { front: 'the coffee', back: 'Kaffee', article: 'der', gender: 'masculine', phonetic: '/ˈka.feː/', examples: [
      { id: 'ex-009a', target: 'Ich trinke morgens immer Kaffee.', native: 'I always drink coffee in the morning.' },
    ], notes: 'Masculine. Very culturally important in Germany!', audioAssetId: 'audio-009', imageUrl: null },
    srsState: makeSrsState('card-009', { masteryLevel: 2, state: 'learning', intervalDays: 3, repetitions: 2, lastRating: 2, lastReviewedAt: daysAgo(2), nextDueAt: new Date().toISOString() }),
  },
  {
    id: 'card-010', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-002'], tags: ['noun', 'food'], version: 1,
    createdAt: '2025-01-19T09:00:00Z', updatedAt: '2025-01-19T09:00:00Z',
    content: { front: 'the cake', back: 'Kuchen', article: 'der', gender: 'masculine', phonetic: '/ˈkuː.xən/', examples: [
      { id: 'ex-010a', target: 'Der Kuchen schmeckt wunderbar.', native: 'The cake tastes wonderful.' },
    ], notes: 'Masculine. Kaffee und Kuchen is a beloved German tradition!', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-010', { masteryLevel: 0, state: 'new', nextDueAt: new Date().toISOString() }),
  },
  {
    id: 'card-011', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-003'], tags: ['noun', 'travel', 'transport'], version: 3,
    createdAt: '2025-01-20T08:00:00Z', updatedAt: '2025-01-20T08:00:00Z',
    content: { front: 'the train', back: 'Zug', article: 'der', gender: 'masculine', phonetic: '/t͡suːk/', examples: [
      { id: 'ex-011a', target: 'Der Zug fährt um 8 Uhr ab.', native: "The train departs at 8 o'clock." },
    ], notes: "Masculine. Germany's rail network (Deutsche Bahn) is extensive.", audioAssetId: 'audio-011', imageUrl: null },
    srsState: makeSrsState('card-011', { masteryLevel: 3, state: 'review', intervalDays: 7, repetitions: 3, lastRating: 3, lastReviewedAt: daysAgo(4), nextDueAt: daysFromNow(3) }),
  },
  {
    id: 'card-014', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-004'], tags: ['verb', 'daily'], version: 2,
    createdAt: '2025-01-21T09:00:00Z', updatedAt: '2025-01-21T09:00:00Z',
    content: { front: 'to eat', back: 'essen', article: null, gender: null, phonetic: '/ˈɛs.ən/', examples: [
      { id: 'ex-014a', target: 'Was isst du zum Mittagessen?', native: 'What are you eating for lunch?' },
    ], notes: 'Strong verb: ich esse, du isst, er/sie isst.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-014', { masteryLevel: 3, state: 'review', intervalDays: 8, repetitions: 3, lastRating: 3, lastReviewedAt: daysAgo(6), nextDueAt: daysFromNow(2) }),
  },
  {
    id: 'card-015', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-004'], tags: ['verb', 'daily'], version: 1,
    createdAt: '2025-01-22T08:00:00Z', updatedAt: '2025-01-22T08:00:00Z',
    content: { front: 'to go', back: 'gehen', article: null, gender: null, phonetic: '/ˈɡeː.ən/', examples: [
      { id: 'ex-015a', target: 'Ich gehe jeden Morgen spazieren.', native: 'I go for a walk every morning.' },
    ], notes: 'Irregular. ich gehe, du gehst, er geht.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-015', { masteryLevel: 5, state: 'mastered', intervalDays: 28, repetitions: 9, lastRating: 5, lastReviewedAt: daysAgo(3), nextDueAt: daysFromNow(25) }),
  },
  {
    id: 'card-018', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-005'], tags: ['noun', 'family'], version: 2,
    createdAt: '2025-01-23T09:00:00Z', updatedAt: '2025-01-23T09:00:00Z',
    content: { front: 'the child', back: 'Kind', article: 'das', gender: 'neuter', phonetic: '/kɪnt/', examples: [
      { id: 'ex-018a', target: 'Das Kind spielt im Garten.', native: 'The child plays in the garden.' },
    ], notes: 'Neuter. Plural: die Kinder.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-018', { masteryLevel: 5, state: 'mastered', intervalDays: 25, repetitions: 7, lastRating: 5, lastReviewedAt: daysAgo(4), nextDueAt: daysFromNow(21) }),
  },
  {
    id: 'card-021', deckId: 'deck-001', collectionId: 'col-001', userId: 'user-001', contextId: 'german-vocab',
    categoryIds: ['cat-006'], tags: ['noun', 'home'], version: 1,
    createdAt: '2025-01-25T08:00:00Z', updatedAt: '2025-01-25T08:00:00Z',
    content: { front: 'the door', back: 'Tür', article: 'die', gender: 'feminine', phonetic: '/tyːɐ̯/', examples: [
      { id: 'ex-021a', target: 'Bitte schließ die Tür!', native: 'Please close the door!' },
    ], notes: 'Feminine. Plural: die Türen.', audioAssetId: null, imageUrl: null },
    srsState: makeSrsState('card-021', { masteryLevel: 3, state: 'review', intervalDays: 6, repetitions: 3, lastRating: 3, lastReviewedAt: daysAgo(5), nextDueAt: daysFromNow(1) }),
  },
];

export const MOCK_DUE_CARDS: Card[] = MOCK_CARDS.filter(
  c => c.srsState && new Date(c.srsState.nextDueAt) <= new Date()
);

// ─── PROGRESS / REVIEW MOCKS ──────────────────────────────────────────────────

export const MOCK_PROGRESS_STATS: ProgressStats = {
  totalCards: 127, masteredCards: 43, learningCards: 51, newCards: 33,
  dayStreak: 14, reviewedToday: 0,
  dueToday: MOCK_DUE_CARDS.length, dueThisWeek: 24,
  averageRating: 3.2, totalReviewSessions: 47, longestStreak: 21,
  weeklyActivity: [
    { date: daysAgo(6), reviewed: 12, newAdded: 3 },
    { date: daysAgo(5), reviewed: 18, newAdded: 5 },
    { date: daysAgo(4), reviewed: 8,  newAdded: 2 },
    { date: daysAgo(3), reviewed: 22, newAdded: 4 },
    { date: daysAgo(2), reviewed: 15, newAdded: 6 },
    { date: daysAgo(1), reviewed: 20, newAdded: 3 },
    { date: new Date().toISOString(), reviewed: 0, newAdded: 0 },
  ],
};

export const MOCK_ACTIVE_REVIEW_SESSION: ReviewSession = {
  id: 'session-001', userId: 'user-001', deckId: 'deck-001',
  startedAt: new Date().toISOString(), completedAt: null,
  totalCards: MOCK_DUE_CARDS.length, reviewedCards: 0,
  newCards: MOCK_DUE_CARDS.filter(c => c.srsState?.state === 'new').length,
  ratings: {},
};
