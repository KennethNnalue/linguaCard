-- Read-only representative batched recommendation vocabulary read.
EXPLAIN (ANALYZE, BUFFERS)
WITH context AS (
 SELECT c.* FROM learning_contexts c JOIN collections col ON col."userId"=c."userId"
 WHERE col.id='b8aae56f-6138-44ff-b578-1ee9f4af8c80' AND c."isActive" LIMIT 1
)
SELECT link."episodeId", link."lexemeId", lexeme."displayText", localization.translation,
 item.id IS NOT NULL AS owned, scheduling.state->>'stage' AS mastery,
 EXISTS(SELECT 1 FROM review_commits commit WHERE commit."userId"=context."userId"
 AND commit."cardId"=coalesce(item."legacyCardId",item.id)
 AND commit."reviewedAt">=now()-interval '7 days') AS reviewed
FROM context
JOIN podcast_topics topic ON topic."targetLanguage"=context."targetLanguage"
 AND topic."translationLanguage"=context."sourceLanguage" AND topic.status='published'
JOIN podcast_episodes episode ON episode."topicId"=topic.id AND episode.status='published'
 AND episode."audioUrl" IS NOT NULL AND episode."audioDurationMs">0
JOIN podcast_episode_vocabulary link ON link."episodeId"=episode.id
JOIN lexemes lexeme ON lexeme.id=link."lexemeId"
JOIN lexeme_localizations localization ON localization."lexemeId"=lexeme.id
 AND localization.language=context."sourceLanguage" AND localization."isActive"
LEFT JOIN learning_items item ON item."lexemeId"=lexeme.id AND item."userId"=context."userId"
 AND item."learningContextId"=context.id
LEFT JOIN review_scheduling scheduling ON scheduling."cardId"=coalesce(item."legacyCardId",item.id)
ORDER BY link.position,link."lexemeId";
