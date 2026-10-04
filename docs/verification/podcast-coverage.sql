-- Read-only, aggregate coverage. Canonical identity; no raw vocabulary/user exports.
SELECT t."targetLanguage", t."translationLanguage", e.level,
 count(DISTINCT e.id) AS playable_episodes, count(DISTINCT v."lexemeId") AS focus_lexemes,
 count(DISTINCT v."lexemeId") FILTER (WHERE loc.id IS NULL) AS missing_localizations
FROM podcast_episodes e JOIN podcast_topics t ON t.id=e."topicId"
LEFT JOIN podcast_episode_vocabulary v ON v."episodeId"=e.id
LEFT JOIN lexeme_localizations loc ON loc."lexemeId"=v."lexemeId"
 AND loc.language=t."translationLanguage" AND loc."isActive"
WHERE e.status='published' AND t.status='published' AND e."audioUrl" IS NOT NULL AND e."audioDurationMs">0
GROUP BY 1,2,3 ORDER BY 1,2,3;

WITH evidence AS (
 SELECT c."targetLanguage",c."sourceLanguage",i."lexemeId",
 EXISTS(SELECT 1 FROM review_commits r WHERE r."userId"=i."userId" AND r."cardId"=coalesce(i."legacyCardId",i.id)) AS reviewed,
 EXISTS(SELECT 1 FROM podcast_episode_vocabulary v JOIN podcast_episodes e ON e.id=v."episodeId"
 JOIN podcast_topics t ON t.id=e."topicId" WHERE v."lexemeId"=i."lexemeId"
 AND t."targetLanguage"=c."targetLanguage" AND t."translationLanguage"=c."sourceLanguage"
 AND e.status='published' AND t.status='published' AND e."audioUrl" IS NOT NULL AND e."audioDurationMs">0) AS covered,
 s."cardId" IS NULL AS missing_scheduling,
 NOT EXISTS(SELECT 1 FROM lexeme_localizations l WHERE l."lexemeId"=i."lexemeId"
 AND l.language=c."sourceLanguage" AND l."isActive") AS missing_localization
 FROM learning_items i JOIN learning_contexts c ON c.id=i."learningContextId"
 LEFT JOIN review_scheduling s ON s."cardId"=coalesce(i."legacyCardId",i.id)
)
SELECT "targetLanguage","sourceLanguage",count(DISTINCT "lexemeId") FILTER(WHERE reviewed) AS reviewed_lexemes,
 count(DISTINCT "lexemeId") FILTER(WHERE covered) AS covered_owned_lexemes,
 count(DISTINCT "lexemeId") FILTER(WHERE reviewed AND covered) AS covered_reviewed_lexemes,
 count(*) FILTER(WHERE missing_scheduling) AS missing_scheduling,
 count(*) FILTER(WHERE missing_localization) AS missing_localizations
FROM evidence GROUP BY 1,2 ORDER BY 1,2;

SELECT count(*) AS unmapped_legacy_cards FROM cards card
WHERE NOT EXISTS(SELECT 1 FROM learning_items item WHERE item."legacyCardId"=card.id);
