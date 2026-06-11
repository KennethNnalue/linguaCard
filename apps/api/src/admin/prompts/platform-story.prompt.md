# Platform Story Generation Prompt

Use this prompt to generate a platform story. Fill the three `{{…}}` slots, paste into your AI tool of choice, and paste the resulting JSON into `POST /admin/platform-stories/import`.

---

```
ROLE: You are a German-language curriculum writer producing a CANONICAL platform story
for a vocabulary app. This story will be shown to MANY learners, so it must be correct,
natural, and tightly scoped to the supplied word list.

TARGET CEFR LEVEL: {{LEVEL}}      // one of A1, A2, B1, B2, C1
TOPIC: {{TOPIC}}                   // e.g. "Food & Drink"
WORD LIST (use these exact words; do not invent vocabulary beyond what this level needs):
{{WORD_LIST}}                      // newline list: "der Apfel = apple", "bestellen = to order", …

HARD RULES
1. Use AT LEAST 80% of the WORD LIST. Every listed word that appears must be in a NATURAL,
   everyday context — never a словарь-style filler sentence.
   ✅ CORRECT: "Im Café bestellt Lena einen Apfelsaft und ein Stück Kuchen."
   ❌ INCORRECT: "Der Apfel ist ein Apfel. Ich bestelle bestellen." (unnatural, forced)
2. Stay strictly at CEFR {{LEVEL}}. For A1/A2: short main clauses, present and simple past,
   no subjunctive, no passive. Higher levels may add subordinate clauses / tenses as the
   level allows. Do NOT exceed the level to sound impressive.
3. Words must appear in CORRECT grammatical form — right article, case, and conjugation.
   ✅ "Sie gibt dem Kellner das Trinkgeld."  (dative)
   ❌ "Sie gibt der Kellner die Trinkgeld."
4. Write a COMPLETE arc (beginning → middle → end) of 8–16 sentences for short,
   16–28 for medium. Include natural dialogue where it fits.
5. Provide an English translation for every sentence and a title translation.
6. Do NOT add words to hit a quota — only natural usage counts toward the 80%.

OUTPUT — valid JSON ONLY, no markdown fences, no commentary:
{
  "title": "German title",
  "titleTranslation": "English title",
  "level": "{{LEVEL}}",
  "topic": "{{TOPIC}}",
  "sentences": [
    { "german": "…", "english": "…", "wordsUsed": ["Apfel", "bestellen"] }
  ],
  "keywords": [
    { "germanBase": "Apfel", "article": "der", "english": "apple",
      "wordType": "noun", "level": "A1" }
  ]
}
```

---

## Import endpoint

`POST /api/v1/admin/platform-stories/import`

Request body:

```json
{
  "platformCollectionId": "uuid-of-collection",
  "story": { ...JSON from the prompt above... }
}
```

The import endpoint resolves `keywords[]` through the global word dictionary (lookup-only, no re-enrichment), so platform-story keywords share canonical entries and audio with collections and user cards.
