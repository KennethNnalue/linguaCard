/**
 * Full column layout (positional — header names are for AI guidance only):
 *  0  front           6  exampleNative
 *  1  back            7  syn1Word        12 syn2Word        17 syn3Word
 *  2  article         8  syn1Article     13 syn2Article     18 syn3Article
 *  3  plural          9  syn1Translation 14 syn2Translation 19 syn3Translation
 *  4  category       10  syn1Example     15 syn2Example     20 syn3Example
 *  5  exampleTarget  11  syn1ExampleNative 16 syn2ExampleNative 21 syn3ExampleNative
 */
export const CLIPBOARD_PROMPT = `I have a list of German words I want to study. Create a CSV file with EXACTLY these column headers (22 columns total):

front,back,article,plural,category,exampleTarget,exampleNative,syn1Word,syn1Article,syn1Translation,syn1Example,syn1ExampleNative,syn2Word,syn2Article,syn2Translation,syn2Example,syn2ExampleNative,syn3Word,syn3Article,syn3Translation,syn3Example,syn3ExampleNative

Column definitions:
- front: English translation (e.g. "dog")
- back: German word WITHOUT article (e.g. "Hund")
- article: der, die, or das — leave empty for verbs, adjectives, phrases
- plural: Full plural WITH article (e.g. "die Hunde") — leave empty for verbs
- category: One of: Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
- exampleTarget: A natural German sentence using the word
- exampleNative: English translation of that sentence
- syn1Word…syn3Word: A German synonym WITHOUT article (near-synonyms a learner would benefit from)
- syn1Article…syn3Article: Article for each synonym (der/die/das or empty)
- syn1Translation…syn3Translation: English translation of each synonym
- syn1Example…syn3Example: A German sentence using the synonym
- syn1ExampleNative…syn3ExampleNative: English translation of that sentence

Rules:
- NEVER include the article in "back", "syn1Word", "syn2Word", or "syn3Word" — articles go in their own columns
- For words with fewer than 3 synonyms, leave the unused syn columns empty (still include the commas)
- Wrap any field containing commas in double quotes
- Include the header row as the first line
- Use correct German grammar in all sentences
- Aim for at least 1 synonym for every noun and verb

Here are my German words:
[PASTE YOUR WORDS HERE — one per line]

Output ONLY the CSV with headers. No markdown fences. No explanations.`;

export const DISPLAY_PROMPT = `Create German vocabulary flashcards as a CSV (22 columns).

Core columns (1–7):
front, back, article, plural, category,
exampleTarget, exampleNative

Synonym columns (8–22, repeat × 3):
syn1Word, syn1Article, syn1Translation,
syn1Example, syn1ExampleNative
(same pattern for syn2 and syn3)

Rules:
• back / syn*Word = German word, NO article
• article / syn*Article = der/die/das or empty
• plural = full form incl. article (e.g. die Hunde)
• At least 1 synonym per noun and verb
• Leave unused synonym columns empty

[PASTE YOUR WORDS HERE]

Output ONLY the CSV. No explanations.`;

export const IMPORT_CATEGORIES = [
  'Food', 'Travel', 'Home', 'Work', 'People',
  'Nature', 'Transport', 'Shopping', 'Health', 'Other',
] as const;
