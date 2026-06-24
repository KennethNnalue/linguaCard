# Platform Story Generation Prompt

Use this prompt to generate a platform story. Fill the three `{{…}}` slots, paste into your AI tool of choice, and paste the resulting JSON into `POST /admin/platform-stories/import`.

---

```
ROLE: You are a German-language curriculum writer producing a CANONICAL platform story
for a vocabulary app. This story will be shown to MANY learners, so it must be correct,
natural, and tightly scoped to the supplied word list.

TARGET CEFR LEVEL: {{LEVEL}}              // one of A1, A2, B1, B2, C1 — caps GRAMMATICAL complexity only
TARGET LENGTH: {{LENGTH}}                  // one of short, medium, long, very-long, extra-long — independent of level
TOPIC: {{TOPIC}}                           // e.g. "Food & Drink"
NATIVE LANGUAGE: {{NATIVE_LANGUAGE}}       // language of ALL translations, e.g. "English", "Spanish", "Arabic"
NATIVE LANGUAGE CODE: {{NATIVE_LANG_CODE}} // ISO code that goes in the output, e.g. "en", "es", "ar"
WORD LIST (use these exact words; do not invent vocabulary beyond what this level needs):
{{WORD_LIST}}                              // newline list: "der Apfel = apple", "bestellen = to order", …

LENGTH TARGETS (pick the row matching {{LENGTH}} — length is INDEPENDENT of CEFR level):
  short       → 80–150 words   (~8–16 sentences)
  medium      → 200–320 words  (~16–28 sentences)
  long        → 400–520 words  (~28–45 sentences)
  very-long   → 700–900 words  (~50–75 sentences)
  extra-long  → 1100–1400 words (~80–110 sentences)

HARD RULES
1. Use AT LEAST 80% of the WORD LIST. Every listed word that appears must be in a NATURAL,
   everyday context — never a словарь-style filler sentence.
   ✅ CORRECT: "Im Café bestellt Lena einen Apfelsaft und ein Stück Kuchen."
   ❌ INCORRECT: "Der Apfel ist ein Apfel. Ich bestelle bestellen." (unnatural, forced)
2. Stay strictly at CEFR {{LEVEL}} for GRAMMAR ONLY. For A1/A2: short main clauses, present and
   simple past, no subjunctive, no passive. Higher levels may add subordinate clauses / tenses as
   the level allows. Do NOT exceed the level to sound impressive. Level governs sentence complexity,
   NOT how long the story is — an A1 story can still be long, just with simple sentences.
3. Words must appear in CORRECT grammatical form — right article, case, and conjugation.
   ✅ "Sie gibt dem Kellner das Trinkgeld."  (dative)
   ❌ "Sie gibt der Kellner die Trinkgeld."
4. Write a COMPLETE arc (beginning → middle → end) that hits the word/sentence count for
   {{LENGTH}} in the LENGTH TARGETS table above. Include natural dialogue where it fits.
5. Translate into {{NATIVE_LANGUAGE}}, NOT English (unless {{NATIVE_LANGUAGE}} IS English).
   The German "german" text stays German; every "native"/"translation"/"exampleNative"
   field — plus the title translation — must be written in {{NATIVE_LANGUAGE}}.
6. Do NOT add words to hit a quota — only natural usage counts toward the 80%.
7. Include 4–6 fill-in-the-blank quiz questions drawn from the story, and 1–3 grammar
   notes appropriate to {{LEVEL}}.

OUTPUT — valid JSON ONLY, no markdown fences, no commentary:
{
  "title": "German title",
  "titleTranslation": "Title in {{NATIVE_LANGUAGE}}",
  "level": "{{LEVEL}}",
  "length": "{{LENGTH}}",
  "topic": "{{TOPIC}}",
  "nativeLang": "{{NATIVE_LANG_CODE}}",
  "sentences": [
    { "german": "…", "native": "… (in {{NATIVE_LANGUAGE}})", "wordsUsed": ["Apfel", "bestellen"] }
  ],
  "keywords": [
    { "germanBase": "Apfel", "article": "der", "translation": "apple (in {{NATIVE_LANGUAGE}})",
      "wordType": "noun", "level": "A1" }
  ],
  "quizQuestions": [
    { "sentenceTemplate": "Im Café bestellt Lena ___ Apfelsaft.", "correctAnswer": "einen",
      "distractors": ["ein", "eine"],
      "audioSentence": "Im Café bestellt Lena einen Apfelsaft.",
      "hint": "Akkusativ, masculine (write hint in {{NATIVE_LANGUAGE}})" }
  ],
  "grammarNotes": [
    { "title": "Accusative article", "exampleDe": "…", "exampleNative": "… (in {{NATIVE_LANGUAGE}})",
      "description": "Explanation in {{NATIVE_LANGUAGE}}.",
      "conjugationTable": [{ "pronoun": "der", "form": "den" }],
      "additionalExamples": [{ "de": "…", "native": "… (in {{NATIVE_LANGUAGE}})" }] }
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
  "isFiction": true,
  "generateAudio": false,
  "story": { ...JSON from the prompt above... }
}
```

Notes:
- `story.nativeLang` (ISO code) sets the translation language stored on the platform story.
  Import one story row per native language. Defaults to `'en'` when omitted.
- `story.length` (`short`|`medium`|`long`|`very-long`|`extra-long`) is stored as the story's
  `lengthType`. When omitted it defaults to `short` for A1/A2 and `medium` otherwise.
- `story.quizQuestions[]` and `story.grammarNotes[]` are optional but recommended — when present
  they are imported so the platform story aligns with user-generated stories.
- The import endpoint resolves `keywords[]` through the global word dictionary (lookup-only, no
  re-enrichment), so platform-story keywords share canonical entries and audio with collections
  and user cards.
- If audio wasn't generated at import (or failed), retry with
  `POST /api/v1/admin/platform-stories/:id/generate-audio`.
