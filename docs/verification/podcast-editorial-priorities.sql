-- Read-only editorial candidates from shared administrator vocabulary.
-- No personal text export or automatic sense/phrase alignment. Keep canonical IDs distinct.
WITH reviewed AS (
 SELECT DISTINCT item."userId",item."lexemeId",context."targetLanguage",context."sourceLanguage"
 FROM learning_items item JOIN learning_contexts context ON context.id=item."learningContextId"
 JOIN review_commits commit ON commit."userId"=item."userId" AND commit."cardId"=coalesce(item."legacyCardId",item.id)
 WHERE commit."reviewedAt">=now()-interval '30 days'
), uncovered AS (
 SELECT reviewed.* FROM reviewed WHERE NOT EXISTS(
 SELECT 1 FROM podcast_episode_vocabulary vocabulary JOIN podcast_episodes episode ON episode.id=vocabulary."episodeId"
 JOIN podcast_topics topic ON topic.id=episode."topicId" WHERE vocabulary."lexemeId"=reviewed."lexemeId"
 AND episode.status='published' AND topic.status='published' AND episode."audioUrl" IS NOT NULL AND episode."audioDurationMs">0
 AND topic."targetLanguage"=reviewed."targetLanguage" AND topic."translationLanguage"=reviewed."sourceLanguage")
)
SELECT uncovered."targetLanguage",uncovered."sourceLanguage",lexeme.id,lexeme."displayText",lexeme."partOfSpeech",
 lexeme."grammarDiscriminator",lexeme."cefrLevel",count(DISTINCT uncovered."userId") AS committed_reviewers
FROM uncovered JOIN lexemes lexeme ON lexeme.id=uncovered."lexemeId" AND lexeme.source='admin'
GROUP BY 1,2,3,4,5,6,7 HAVING count(DISTINCT uncovered."userId")>=2
ORDER BY committed_reviewers DESC,lexeme.id LIMIT 50;
