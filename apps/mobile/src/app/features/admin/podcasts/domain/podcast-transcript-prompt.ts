import type { AdminPodcastEpisodeListItem, AdminPodcastTopicListItem } from '@lingua-card/shared/domain';

type TranscriptPromptTopic = Pick<
  AdminPodcastTopicListItem,
  'title' | 'description' | 'targetLanguage' | 'translationLanguage'
>;

type TranscriptPromptEpisode = Pick<
  AdminPodcastEpisodeListItem,
  'title' | 'description' | 'level'
>;

export function buildPodcastTranscriptPrompt(
  topic: TranscriptPromptTopic,
  episode: TranscriptPromptEpisode,
  preferredVocabulary: string,
): string {
  const suppliedVocabulary = preferredVocabulary.trim();
  const vocabularyInstruction = suppliedVocabulary
    ? `Administrator-supplied creative brief (one item per line or comma-separated):\n${suppliedVocabulary}`
    : 'Administrator-supplied vocabulary: none. Choose vocabulary that best fits the topic and level.';

  return `Create a short LinguaCard podcast transcript for language learners.

Topic: ${topic.title}
Topic description: ${topic.description}
Episode: ${episode.title}
Episode description: ${episode.description}
Target language: ${topic.targetLanguage}
Translation language: ${topic.translationLanguage}
CEFR level: ${episode.level}
${vocabularyInstruction}

Return valid JSON only, without Markdown fences or commentary. Use exactly this structure:
{
  "schemaVersion": 1,
  "episode": {
    "title": "A concise derived episode title in ${topic.targetLanguage}",
    "titleTranslation": "The episode title in ${topic.translationLanguage}",
    "description": "A concise learner-facing summary in ${topic.translationLanguage}"
  },
  "speakers": [
    { "key": "speaker-1", "name": "Speaker name", "voiceGender": "female" },
    { "key": "speaker-2", "name": "Speaker name", "voiceGender": "male" }
  ],
  "turns": [
    {
      "speakerKey": "speaker-1",
      "targetText": "Dialogue in ${topic.targetLanguage}",
      "translation": "Manual translation in ${topic.translationLanguage}",
      "vocabularyRefs": ["stable-vocabulary-key"]
    }
  ],
  "vocabulary": [
    {
      "key": "stable-vocabulary-key",
      "text": "Dictionary form in ${topic.targetLanguage}",
      "translation": "Dictionary translation in ${topic.translationLanguage}",
      "importance": "essential"
    }
  ]
}

Requirements:
- If the creative brief contains a line beginning with "Title:", treat the text after it as title inspiration, not as vocabulary.
- Derive a concise, natural episode.title from the title inspiration, supplied words, and conversation you create. It does not need to match the existing episode name.
- Set episode.titleTranslation to an accurate ${topic.translationLanguage} translation and make episode.description describe the generated conversation.
- Write a natural two-speaker conversation appropriate for ${episode.level} learners.
- Give every speaker a voiceGender of exactly "female" or "male". Choose names and conversation roles that clearly match the selected voiceGender so LinguaCard can assign an appropriate ElevenLabs voice automatically.
- Do not alternate or guess voiceGender from speaker order. Keep each character's voiceGender consistent throughout the transcript.
- Keep the complete target-language dialogue below 2,000 characters and approximately 2–4 minutes.
- Treat every creative-brief item other than the "Title:" line as required vocabulary and use it naturally in the dialogue.
- Preserve supplied target words and translations exactly when both are provided, using formats such as "der Kaffee = coffee" or "bezahlen = to pay".
- If a supplied item has no translation, provide an accurate dictionary translation.
- Include 8–15 vocabulary items in total. If fewer than 8 were supplied, add only enough relevant supporting words to reach 8. Do not replace supplied words.
- Mark administrator-supplied words as "essential" and AI-added words as "supporting".
- If topic or episode context is sparse, infer a coherent everyday scenario from the available title, description, and vocabulary.
- Every speakerKey must match a speakers[].key.
- Every vocabularyRefs entry must match a vocabulary[].key.
- Use unique lowercase kebab-case keys.
- Put manual translations in every turn; do not translate speaker names.
- Do not add fields beyond the demonstrated schema.
- Do not include voice IDs. LinguaCard assigns a provider voice matching each speaker's voiceGender automatically.`;
}
