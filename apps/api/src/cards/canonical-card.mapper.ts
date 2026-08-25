import type {
  ArticleType,
  CardView,
  GenderType,
  ScheduledCard,
} from '@lingua-card/shared/domain';

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function articleValue(value: unknown): ArticleType {
  switch (value) {
    case 'der':
    case 'die':
    case 'das':
    case 'le':
    case 'la':
    case 'el':
    case 'un':
    case 'une':
      return value;
    default:
      return null;
  }
}

function genderValue(value: unknown): GenderType {
  switch (value) {
    case 'masculine':
    case 'feminine':
    case 'neuter':
      return value;
    default:
      return null;
  }
}

function firstPlural(grammar: Readonly<Record<string, unknown>>): string | null {
  const plurals = grammar['plurals'];
  if (!Array.isArray(plurals)) return null;
  return plurals.map(stringValue).find((value): value is string => value !== null) ?? null;
}

export function canonicalCardToScheduledCard(userId: string, card: CardView): ScheduledCard {
  return {
    id: card.id,
    deckId: 'deck-001',
    collectionId: card.collectionIds[0] ?? null,
    userId,
    contextId: card.learningContextId,
    dictionaryWordId: null,
    content: {
      front: card.localization.translation,
      back: card.lexeme.text,
      article: articleValue(card.lexeme.grammar['article']),
      gender: genderValue(card.lexeme.grammar['gender']),
      plural: firstPlural(card.lexeme.grammar),
      examples: card.examples.map(example => ({
        id: example.id,
        target: example.targetText,
        native: example.sourceText ?? '',
      })),
      synonyms: [],
      notes: card.personalNote,
      imageUrl: null,
      phonetic: card.lexeme.phonetic,
    },
    categoryIds: [],
    tags: [],
    version: 1,
    reviewState: card.reviewState,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}
