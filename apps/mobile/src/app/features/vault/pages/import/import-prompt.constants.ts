export const CLIPBOARD_PROMPT = `I have a list of German words I want to study. Create a CSV file with these exact column headers:

front,back,article,plural,category,exampleTarget,exampleNative

Column definitions:
- front: English translation (e.g. "dog")
- back: German word WITHOUT article (e.g. "Hund")
- article: der, die, or das — leave empty for verbs, adjectives, phrases
- plural: Full plural with article (e.g. "die Hunde") — leave empty for verbs
- category: One of: Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
- exampleTarget: A natural German sentence using the word
- exampleNative: English translation of that sentence

Rules:
- The "back" column must NEVER include the article — that goes in the "article" column only
- Wrap any field that contains commas in double quotes
- Include the header row as the first line
- Use correct German grammar in all sentences

Here are my German words:
[PASTE YOUR WORDS HERE — one per line]

Output ONLY the CSV with headers. No markdown fences. No explanations.`;

export const DISPLAY_PROMPT = `Create German vocabulary flashcards as a CSV.

Columns: front,back,article,plural,category,exampleTarget,exampleNative

• front = English translation
• back = German word (no article)
• article = der/die/das or empty
• plural = full form (e.g. die Hunde)
• category = Food, Travel, Home, Work, People, Nature, Transport, Shopping, Health, Other
• exampleTarget = German sentence with the word
• exampleNative = English translation of the sentence

[PASTE YOUR WORDS HERE]

Output ONLY the CSV. No explanations.`;

export const IMPORT_CATEGORIES = [
  'Food', 'Travel', 'Home', 'Work', 'People',
  'Nature', 'Transport', 'Shopping', 'Health', 'Other',
] as const;
