import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PodcastOnboardingExample } from '@lingua-card/shared/domain';
export interface ExampleRow extends PodcastOnboardingExample { collectionId: string; }
@Injectable()
export class PodcastOnboardingExampleRepository {
  constructor(private readonly dataSource: DataSource) {}
  findCandidates(collectionId: string, targetLanguage: string, sourceLanguage: string): Promise<ExampleRow[]> {
    return this.dataSource.query<ExampleRow[]>(`
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
        AND localization.language=$3 AND localization."isActive"
      JOIN podcast_turns turn ON turn."episodeId"=episode.id
      WHERE collection.id=$1 AND collection."isPublished" AND collection."targetLanguage"=$2 AND collection."sourceLanguage"=$3
        AND topic."targetLanguage"=$2 AND topic."translationLanguage"=$3 AND topic.status='published' AND episode.status='published'
        AND NULLIF(trim(episode."audioUrl"),'') IS NOT NULL AND episode."audioDurationMs">0
        AND turn."startMs">=0 AND turn."endMs">turn."startMs" AND turn."endMs"<=episode."audioDurationMs"
      ORDER BY episode.id,link.position,turn.position LIMIT 500
    `, [collectionId, targetLanguage, sourceLanguage]);
  }
}
