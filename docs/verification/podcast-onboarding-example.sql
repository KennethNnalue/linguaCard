-- Read-only production example for the audited platform source.
-- Application additionally applies Unicode whole-headword matching; this SQL uses only simple alphabetic headwords.

      SELECT collection.id AS "collectionId", episode.id AS "episodeId", episode.title AS "episodeTitle",
        episode."titleTranslation" AS "episodeTitleTranslation", episode."audioUrl", episode."audioVersion",
        lexeme.id AS "lexemeId", lexeme."displayText" AS word, localization.translation,
        turn."targetText" AS "transcriptText", turn.translation AS "transcriptTranslation",
        turn."startMs", turn."endMs"
      FROM platform_collections collection
      JOIN platform_collection_words card ON card."platformCollectionId"=collection.id
      JOIN podcast_episode_vocabulary link ON link."lexemeId"=card."lexemeId"
      JOIN podcast_episodes episode ON episode.id=link."episodeId" AND episode.level=collection.level
      JOIN podcast_topics topic ON topic.id=episode."topicId"
      JOIN lexemes lexeme ON lexeme.id=link."lexemeId"
      JOIN lexeme_localizations localization ON localization."lexemeId"=lexeme.id
        AND localization.language='en' AND localization."isActive"
      JOIN podcast_turns turn ON turn."episodeId"=episode.id
      WHERE collection.id='53119792-eb93-411d-9b83-b4cfafc11c2e' AND collection."isPublished" AND collection."targetLanguage"='de' AND collection."sourceLanguage"='en'
        AND topic."targetLanguage"='de' AND topic."translationLanguage"='en' AND topic.status='published' AND episode.status='published'
        AND NULLIF(trim(episode."audioUrl"),'') IS NOT NULL AND episode."audioDurationMs">0
        AND turn."startMs">=0 AND turn."endMs">turn."startMs" AND turn."endMs"<=episode."audioDurationMs"
        AND lexeme."displayText" ~ '^[[:alpha:] ]+$'
        AND turn."targetText" ~* ('\m' || lexeme."displayText" || '\M')
      ORDER BY episode.id,link.position,turn.position LIMIT 1
    ;
