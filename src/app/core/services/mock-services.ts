// ============================================================
//  LinguaCard — Angular Mock Services
//  Drop these into src/app/core/services/
//  They mirror the real API shape exactly — swap the mock
//  implementations for real HTTP calls when the backend is ready.
// ============================================================

import {computed, Injectable, signal} from '@angular/core';
import {delay, Observable, of, throwError} from 'rxjs';
import {
  Card,
  CardContent,
  Category,
  ConfidenceRating,
  GERMAN_VOCAB_CONTEXT,
  LearningContext,
  MasteryLevel,
  MOCK_CARDS,
  MOCK_CATEGORIES,
  MOCK_DECK,
  MOCK_PROGRESS_STATS,
  MOCK_USER,
  MOCK_USER_PREFERENCES,
  PaginatedResponse,
  ProgressStats,
  ReviewSession,
  SRSStateData,
  SyncOperation,
  SyncStatus,
  User,
  UserPreferences,
} from '../models/mock-data';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function simulateDelay<T>(data: T, ms = 350): Observable<T> {
  return of(data).pipe(delay(ms));
}

function sm2NextInterval(state: SRSStateData, rating: ConfidenceRating): Partial<SRSStateData> {
  let {intervalDays, easeFactor, repetitions} = state;
  if (rating < 3) {
    // Reset
    repetitions = 0;
    intervalDays = rating === 0 ? 1 : 2;
    easeFactor = Math.max(1.3, easeFactor - (rating === 0 ? 0.2 : 0.15));
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    const easeAdjust = 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02);
    easeFactor = Math.max(1.3, easeFactor + easeAdjust);
  }
  const masteryLevel = Math.min(5, Math.floor(repetitions / 2)) as MasteryLevel;
  const nextDueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();
  const srsState = repetitions === 0 ? 'new'
    : masteryLevel >= 4 ? 'mastered'
      : repetitions <= 2 ? 'learning' : 'review';
  return {
    intervalDays, easeFactor, repetitions, lastRating: rating,
    lastReviewedAt: new Date().toISOString(), nextDueAt,
    masteryLevel: masteryLevel as MasteryLevel, state: srsState as any
  };
}

// ─── AUTH SERVICE ─────────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockAuthService {
  private _user = signal<User | null>(MOCK_USER);
  private _token = signal<string | null>('mock-jwt-token-abc123');

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticatedSignal = computed(() => !!this._token());

  isAuthenticated(): Observable<boolean> {
      return simulateDelay(!!this._token());
  }

  login(email: string, _password: string): Observable<{ accessToken: string; user: User }> {
    const user = {...MOCK_USER, email};
    this._user.set(user);
    this._token.set('mock-jwt-token-abc123');
    return simulateDelay({accessToken: 'mock-jwt-token-abc123', user});
  }

  register(name: string, email: string, _password: string): Observable<{ accessToken: string; user: User }> {
    const user: User = {
      id: uuid(), email, name,
      avatarInitials: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
      createdAt: new Date().toISOString()
    };
    this._user.set(user);
    this._token.set('mock-jwt-token-new');
    return simulateDelay({accessToken: 'mock-jwt-token-new', user});
  }

  logout(): Observable<void> {
    this._user.set(null);
    this._token.set(null);
    return simulateDelay(undefined as any);
  }

  refreshToken(): Observable<{ accessToken: string }> {
    return simulateDelay({accessToken: 'mock-jwt-token-refreshed'});
  }
}

// ─── CARD SERVICE ─────────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockCardService {
  private _cards = signal<Card[]>([...MOCK_CARDS]);

  readonly cards = this._cards.asReadonly();

  getCards(params?: {
    categoryId?: string; search?: string; masteryLevel?: MasteryLevel;
    page?: number; limit?: number;
  }): Observable<PaginatedResponse<Card>> {
    let filtered = [...this._cards()];
    if (params?.categoryId) {
      filtered = filtered.filter(c => c.categoryIds.includes(params.categoryId!));
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(c =>
        c.content.front.toLowerCase().includes(q) ||
        c.content.back.toLowerCase().includes(q) ||
        c.tags.some(t => t.includes(q))
      );
    }
    if (params?.masteryLevel !== undefined) {
      filtered = filtered.filter(c => c.srsState?.masteryLevel === params.masteryLevel);
    }
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);
    return simulateDelay({
      data, total: filtered.length, page, limit,
      hasNextPage: start + limit < filtered.length,
    });
  }

  getCard(id: string): Observable<Card> {
    const card = this._cards().find(c => c.id === id);
    if (!card) return throwError(() => new Error(`Card ${id} not found`));
    return simulateDelay(card);
  }

  getDueCards(limit = 20): Observable<Card[]> {
    const due = this._cards()
      .filter(c => c.srsState && new Date(c.srsState.nextDueAt) <= new Date())
      .sort((a, b) =>
        new Date(a.srsState!.nextDueAt).getTime() - new Date(b.srsState!.nextDueAt).getTime()
      )
      .slice(0, limit);
    return simulateDelay(due);
  }

  createCard(content: CardContent, categoryIds: string[], tags: string[] = []): Observable<Card> {
    const initialSRS: SRSStateData = {
      id: uuid(), cardId: '', userId: MOCK_USER.id, algorithm: 'sm2',
      intervalDays: 1, easeFactor: 2.5, repetitions: 0, lastRating: null,
      lastReviewedAt: null, nextDueAt: new Date().toISOString(),
      masteryLevel: 0, state: 'new',
    };
    const card: Card = {
      id: uuid(), deckId: MOCK_DECK.id, userId: MOCK_USER.id,
      contextId: 'german-vocab', content, categoryIds, tags,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      version: 1, srsState: {...initialSRS, cardId: ''},
    };
    card.srsState!.cardId = card.id;
    this._cards.update(cards => [card, ...cards]);
    return simulateDelay(card, 500);
  }

  updateCard(id: string, partial: Partial<CardContent>): Observable<Card> {
    let updated: Card | undefined;
    this._cards.update(cards => cards.map(c => {
      if (c.id !== id) return c;
      updated = {
        ...c, content: {...c.content, ...partial},
        updatedAt: new Date().toISOString(), version: c.version + 1
      };
      return updated;
    }));
    if (!updated) return throwError(() => new Error(`Card ${id} not found`));
    return simulateDelay(updated);
  }

  deleteCard(id: string): Observable<void> {
    this._cards.update(cards => cards.filter(c => c.id !== id));
    return simulateDelay(undefined as any, 200);
  }

  rateCard(cardId: string, rating: ConfidenceRating): Observable<SRSStateData> {
    let newState: SRSStateData | undefined;
    this._cards.update(cards => cards.map(c => {
      if (c.id !== cardId || !c.srsState) return c;
      const update = sm2NextInterval(c.srsState, rating);
      newState = {...c.srsState, ...update};
      return {...c, srsState: newState};
    }));
    if (!newState) return throwError(() => new Error(`Card ${cardId} not found`));
    return simulateDelay(newState, 200);
  }
}

// ─── CATEGORY SERVICE ─────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockCategoryService {
  private _categories = signal<Category[]>([...MOCK_CATEGORIES]);
  readonly categories = this._categories.asReadonly();

  getCategories(): Observable<Category[]> {
    return simulateDelay([...this._categories()]);
  }

  createCategory(name: string, colour = '#2D5A4E'): Observable<Category> {
    const cat: Category = {
      id: uuid(), userId: MOCK_USER.id, name, colour, cardCount: 0,
      createdAt: new Date().toISOString(),
    };
    this._categories.update(cats => [...cats, cat]);
    return simulateDelay(cat, 400);
  }

  updateCategory(id: string, partial: Partial<Pick<Category, 'name' | 'colour'>>): Observable<Category> {
    let updated: Category | undefined;
    this._categories.update(cats => cats.map(c => {
      if (c.id !== id) return c;
      updated = {...c, ...partial};
      return updated!;
    }));
    if (!updated) return throwError(() => new Error(`Category ${id} not found`));
    return simulateDelay(updated);
  }

  deleteCategory(id: string): Observable<void> {
    this._categories.update(cats => cats.filter(c => c.id !== id));
    return simulateDelay(undefined as any, 200);
  }
}

// ─── REVIEW SERVICE ───────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockReviewService {
  private _activeSession = signal<ReviewSession | null>(null);
  readonly activeSession = this._activeSession.asReadonly();

  startSession(cards: Card[]): Observable<ReviewSession> {
    const session: ReviewSession = {
      id: uuid(), userId: MOCK_USER.id, deckId: MOCK_DECK.id,
      startedAt: new Date().toISOString(), completedAt: null,
      totalCards: cards.length, reviewedCards: 0,
      newCards: cards.filter(c => c.srsState?.state === 'new').length,
      ratings: {},
    };
    this._activeSession.set(session);
    return simulateDelay(session, 200);
  }

  submitRating(sessionId: string, cardId: string, rating: ConfidenceRating): Observable<void> {
    this._activeSession.update(s => {
      if (!s || s.id !== sessionId) return s;
      return {
        ...s,
        reviewedCards: s.reviewedCards + 1,
        ratings: {...s.ratings, [cardId]: rating},
      };
    });
    return simulateDelay(undefined as any, 150);
  }

  completeSession(sessionId: string): Observable<ReviewSession> {
    let completed: ReviewSession | null = null;
    this._activeSession.update(s => {
      if (!s || s.id !== sessionId) return s;
      completed = {...s, completedAt: new Date().toISOString()};
      return completed;
    });
    if (!completed) return throwError(() => new Error('No active session'));
    return simulateDelay(completed!, 300);
  }
}

// ─── PROGRESS SERVICE ─────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockProgressService {
  getStats(): Observable<ProgressStats> {
    return simulateDelay({...MOCK_PROGRESS_STATS});
  }
}

// ─── USER SERVICE ─────────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockUserService {
  private _prefs = signal<UserPreferences>({...MOCK_USER_PREFERENCES});
  readonly preferences = this._prefs.asReadonly();

  getPreferences(): Observable<UserPreferences> {
    return simulateDelay({...this._prefs()});
  }

  updatePreferences(partial: Partial<UserPreferences>): Observable<UserPreferences> {
    this._prefs.update(p => ({...p, ...partial}));
    return simulateDelay({...this._prefs()});
  }
}

// ─── CONTEXT SERVICE ──────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockContextService {
  private _contexts: LearningContext[] = [GERMAN_VOCAB_CONTEXT];
  private _active = signal<LearningContext>(GERMAN_VOCAB_CONTEXT);
  readonly activeContext = this._active.asReadonly();

  getContexts(): Observable<LearningContext[]> {
    return simulateDelay([...this._contexts]);
  }

  setActiveContext(id: string): void {
    const ctx = this._contexts.find(c => c.id === id);
    if (ctx) this._active.set(ctx);
  }
}

// ─── SYNC SERVICE ─────────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockSyncService {
  private _status = signal<SyncStatus>('synced');
  private _pendingOps: SyncOperation[] = [];
  readonly syncStatus = this._status.asReadonly();

  enqueue(type: SyncOperation['type'], payload: unknown): void {
    this._pendingOps.push({
      id: uuid(), type, payload,
      createdAt: new Date().toISOString(),
      retryCount: 0, status: 'pending',
    });
    this._status.set('pending');
    this._processQueue();
  }

  private _processQueue(): void {
    if (!navigator.onLine) return;
    this._status.set('syncing');
    // Simulate processing
    setTimeout(() => {
      this._pendingOps = [];
      this._status.set('synced');
    }, 1200);
  }

  forcSync(): Observable<void> {
    this._processQueue();
    return simulateDelay(undefined as any, 1200);
  }
}

// ─── AUDIO SERVICE ────────────────────────────────────────────────────────────

@Injectable({providedIn: 'root'})
export class MockAudioService {
  private _currentAudio: HTMLAudioElement | null = null;
  private _isPlaying = signal(false);
  readonly isPlaying = this._isPlaying.asReadonly();

  /**
   * In mock mode: uses browser SpeechSynthesis for TTS.
   * In production: calls /api/v1/audio/tts and plays the returned URL.
   */
  speak(text: string, lang = 'de-DE', rate = 1.0): Observable<void> {
    return new Observable(observer => {
      if (!('speechSynthesis' in window)) {
        observer.complete();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.onstart = () => this._isPlaying.set(true);
      utterance.onend = () => {
        this._isPlaying.set(false);
        observer.next();
        observer.complete();
      };
      utterance.onerror = (e) => {
        this._isPlaying.set(false);
        observer.error(e);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this._isPlaying.set(false);
  }

  uploadAudio(_file: Blob): Observable<{ audioAssetId: string; url: string }> {
    // Mock: returns a fake asset ID
    return simulateDelay({audioAssetId: uuid(), url: ''}, 800);
  }

  generateTTS(text: string, language = 'de'): Observable<{ audioAssetId: string; url: string }> {
    // Mock: uses browser TTS, returns fake ID
    this.speak(text, language === 'de' ? 'de-DE' : 'en-US').subscribe();
    return simulateDelay({audioAssetId: uuid(), url: ''}, 500);
  }
}
