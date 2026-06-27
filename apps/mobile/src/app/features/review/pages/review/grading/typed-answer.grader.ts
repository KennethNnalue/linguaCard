import type { ArticleType, ConfidenceRating } from '@lingua-card/shared/domain';

/**
 * Strict article/gender grader for the Review "Type answer" mode.
 *
 * Pure + framework-free + i18n-clean: returns *semantic* data only (no English
 * labels). The component maps `outcome` to translate keys and composes the
 * gender note from `correctArticle` / `userArticle`.
 *
 * Algorithm mirrors the design prototype exactly
 * (design_handoff_review_redesign/Review.dc.html → `_checkTyped`):
 *   1. normalize: trim, lowercase, collapse whitespace
 *   2. nouns (article present): full target = "{article} {word}"; parse a leading
 *      der/die/das off the input → artUser + nounUser; else artUser = null.
 *   3. nounExact / nounClose (levenshtein ≤ 2 && word.length > 3) / artOk
 *   4. verdict + suggested rating + gender note
 */

export type TypedOutcome =
  | 'correct' // right noun + right article (or article-less word)
  | 'gender' // right noun, wrong/missing article — "Mind the gender"
  | 'close' // near-miss spelling — "So close"
  | 'wrong'; // "Not quite"

export interface TypedCharDiff {
  /** A single character of the typed answer (a space stays a space). */
  ch: string;
  /** True when it matches the full target at this index (case-insensitive). */
  ok: boolean;
}

export interface TypedAnswerResult {
  outcome: TypedOutcome;
  /** Suggested FSRS rating to pre-highlight: Good(3) / Hard(2) / Again(1). */
  suggested: ConfidenceRating;
  /** Tint bucket — correct / close / wrong (gender groups with close). */
  tint: 'correct' | 'close' | 'wrong';
  /** The card's correct article, or null for verbs / article-less words. */
  correctArticle: ArticleType | null;
  /** The leading article the user typed, or null. */
  userArticle: ArticleType | null;
  /** True when an article was required but missing or mismatched. */
  articleWrong: boolean;
  /** Per-character diff of the trimmed answer against the full target. */
  youChars: TypedCharDiff[];
  /** The trimmed answer, as typed (for display). */
  typedRaw: string;
}

const ARTICLE_RE = /^(der|die|das)\s+(.*)$/;

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Per-character green/red diff of the typed answer vs the full target. */
export function diffChars(typed: string, target: string): TypedCharDiff[] {
  const chars: TypedCharDiff[] = [];
  for (let i = 0; i < typed.length; i++) {
    const ch = typed[i];
    const ok = !!target[i] && target[i].toLowerCase() === ch.toLowerCase();
    chars.push({ ch, ok });
  }
  return chars;
}

/**
 * Grade a typed answer for a card.
 * @param input    the raw text the user typed
 * @param word     the card's target word (German), without article
 * @param article  the card's article (der/die/das) or null for verbs/adjectives
 */
export function gradeTypedAnswer(
  input: string,
  word: string,
  article: ArticleType | null,
): TypedAnswerResult {
  const typedRaw = input.trim();
  const raw = typedRaw.toLowerCase().replace(/\s+/g, ' ');
  const needsArticle = !!article;
  const targetFull = (needsArticle ? `${article} ` : '') + word;

  const m = raw.match(ARTICLE_RE);
  const userArticle = (m ? m[1] : null) as ArticleType | null;
  const nounUser = (m ? m[2] : raw).trim();
  const nounTarget = word.toLowerCase();

  const nounExact = nounUser === nounTarget;
  const nounClose = levenshtein(nounUser, nounTarget) <= 2 && nounTarget.length > 3;
  const artOk = needsArticle ? userArticle === article : true;
  const articleWrong = needsArticle && !artOk;

  let outcome: TypedOutcome;
  if (nounExact && artOk) {
    outcome = 'correct';
  } else if (nounExact && articleWrong) {
    outcome = 'gender';
  } else if (nounClose) {
    outcome = 'close';
  } else {
    outcome = 'wrong';
  }

  const suggested: ConfidenceRating = outcome === 'correct' ? 3 : outcome === 'wrong' ? 1 : 2;
  const tint = outcome === 'correct' ? 'correct' : outcome === 'wrong' ? 'wrong' : 'close';

  return {
    outcome,
    suggested,
    tint,
    correctArticle: article,
    userArticle,
    articleWrong,
    youChars: diffChars(typedRaw, targetFull),
    typedRaw,
  };
}
