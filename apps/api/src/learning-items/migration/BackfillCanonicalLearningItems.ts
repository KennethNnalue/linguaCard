import { MigrationInterface, QueryRunner } from 'typeorm';
import { LexemeIdentityService } from '../../vocabulary/domain/lexeme-identity.service';
import { stableResourceId } from '../../vocabulary/domain/stable-resource-id';
import { SpeechIdentityService } from '../../vocabulary/domain/speech-identity.service';
import type { CardContent } from '@lingua-card/shared/domain';

interface LegacyExampleRow {
  id?: string;
  target: string;
  native: string;
}

interface LegacyAudioRow {
  displayText: string;
  language: string;
  audioUrl: string | null;
  storagePath: string | null;
  durationMs: number;
  status: 'pending' | 'ready' | 'failed';
  failedAt: Date | null;
}

interface LegacyDictionaryRow {
  id: string;
  displayText: string;
  targetLang: string;
  nativeLang: string;
  translation: string;
  article: 'der' | 'die' | 'das' | null;
  gender: 'masculine' | 'feminine' | 'neuter' | null;
  plurals: string[];
  wordType: string;
  phonetic: string | null;
  cefrLevel: string | null;
  source: string;
  model: string | null;
  examples: LegacyExampleRow[];
}

interface UnlinkedLegacyCardRow {
  id: string;
  userId: string;
  collectionId: string | null;
  content: CardContent;
  createdAt: Date;
  updatedAt: Date;
}

export class BackfillCanonicalLearningItems1787440000000 implements MigrationInterface {
  name = 'BackfillCanonicalLearningItems1787440000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [7_314_209_006]);
    const dictionary = await queryRunner.query(`
      SELECT id, "displayText", "targetLang", "nativeLang", translation, article,
             gender, plurals, "wordType", phonetic, "cefrLevel", source, model, examples
      FROM word_dictionary
      ORDER BY id
    `) as LegacyDictionaryRow[];
    const identityService = new LexemeIdentityService();

    for (const row of dictionary) {
      const identity = identityService.createIdentity({
        language: row.targetLang,
        text: row.displayText,
        partOfSpeech: row.wordType,
        grammar: { article: row.article, gender: row.gender, plurals: row.plurals },
      });
      const lexemeId = stableResourceId(
        'lexeme', identity.language, identity.normalizedLemma,
        identity.partOfSpeech, identity.grammarDiscriminator,
      );
      await queryRunner.query(`
        INSERT INTO lexemes
          (id, language, "normalizedLemma", "displayText", "partOfSpeech",
           "grammarDiscriminator", grammar, phonetic, "cefrLevel", source, model)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
        ON CONFLICT (language, "normalizedLemma", "partOfSpeech", "grammarDiscriminator")
        DO UPDATE SET
          "displayText" = EXCLUDED."displayText",
          grammar = EXCLUDED.grammar,
          phonetic = COALESCE(EXCLUDED.phonetic, lexemes.phonetic),
          "cefrLevel" = COALESCE(EXCLUDED."cefrLevel", lexemes."cefrLevel"),
          "updatedAt" = now()
      `, [
        lexemeId, identity.language, identity.normalizedLemma, identity.displayText,
        identity.partOfSpeech, identity.grammarDiscriminator,
        JSON.stringify({ article: row.article, gender: row.gender, plurals: row.plurals }),
        row.phonetic, row.cefrLevel, row.source, row.model,
      ]);
      const existingLexeme: Array<{ id: string }> = await queryRunner.query(`
        SELECT id FROM lexemes
        WHERE language = $1 AND "normalizedLemma" = $2
          AND "partOfSpeech" = $3 AND "grammarDiscriminator" = $4
      `, [identity.language, identity.normalizedLemma, identity.partOfSpeech, identity.grammarDiscriminator]);
      const canonicalLexemeId = existingLexeme[0].id;
      const sourceLanguage = row.nativeLang.split('-')[0].toLowerCase();
      await queryRunner.query(`
        INSERT INTO lexeme_localizations
          (id, "lexemeId", language, translation, definition, synonyms, status,
           "contentVersion", "isActive", source, model)
        VALUES ($1,$2,$3,$4,NULL,'[]'::jsonb,'ready',1,true,$5,$6)
        ON CONFLICT ("lexemeId", language, "contentVersion")
        DO UPDATE SET translation = EXCLUDED.translation, status = 'ready', "isActive" = true,
                      "updatedAt" = now()
      `, [
        stableResourceId('lexeme-localization', canonicalLexemeId, sourceLanguage, '1'),
        canonicalLexemeId, sourceLanguage, row.translation, row.source, row.model,
      ]);
      await queryRunner.query(`
        INSERT INTO legacy_dictionary_lexemes ("dictionaryWordId", "lexemeId")
        VALUES ($1,$2)
        ON CONFLICT ("dictionaryWordId") DO UPDATE SET "lexemeId" = EXCLUDED."lexemeId"
      `, [row.id, canonicalLexemeId]);

      for (let position = 0; position < row.examples.length; position += 1) {
        const example = row.examples[position];
        const displayText = example.target.normalize('NFC').trim().replace(/\s+/gu, ' ');
        if (!displayText) continue;
        const normalizedText = displayText.toLocaleLowerCase(identity.language);
        const exampleId = stableResourceId('example-sentence', canonicalLexemeId, identity.language, normalizedText);
        await queryRunner.query(`
          INSERT INTO example_sentences
            (id, "lexemeId", language, "normalizedText", "displayText", position, source, model)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT ("lexemeId", language, "normalizedText")
          DO UPDATE SET "displayText" = EXCLUDED."displayText", position = EXCLUDED.position,
                        "updatedAt" = now()
        `, [exampleId, canonicalLexemeId, identity.language, normalizedText, displayText, position, row.source, row.model]);
        const sourceText = example.native.normalize('NFC').trim().replace(/\s+/gu, ' ');
        if (!sourceText) continue;
        await queryRunner.query(`
          INSERT INTO example_localizations
            (id, "exampleSentenceId", language, text, status, "contentVersion", "isActive", source, model)
          VALUES ($1,$2,$3,$4,'ready',1,true,$5,$6)
          ON CONFLICT ("exampleSentenceId", language, "contentVersion")
          DO UPDATE SET text = EXCLUDED.text, status = 'ready', "isActive" = true, "updatedAt" = now()
        `, [
          stableResourceId('example-localization', exampleId, sourceLanguage, '1'),
          exampleId, sourceLanguage, sourceText, row.source, row.model,
        ]);
      }
    }

    await queryRunner.query(`
      UPDATE cards card
      SET "collectionId" = NULL,
          "updatedAt" = now()
      WHERE card."collectionId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM collections collection
          WHERE collection.id = card."collectionId"
            AND collection."userId" = card."userId"
        )
    `);

    await queryRunner.query(`
      INSERT INTO users
        (id, email, name, "passwordHash", "avatarInitials", "isAdmin")
      SELECT
        'user-001', 'migrated-user-001@invalid.local', 'Demo learner',
        '!disabled-migrated-demo-account', 'DL', false
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 'user-001')
        AND EXISTS (
          SELECT 1 FROM cards WHERE "userId" = 'user-001'
          UNION ALL
          SELECT 1 FROM collections WHERE "userId" = 'user-001'
        )
      ON CONFLICT DO NOTHING
    `);

    const unlinkedCards = await queryRunner.query(`
      SELECT id, "userId", "collectionId", content, "createdAt", "updatedAt"
      FROM cards card
      WHERE card."contextId" = 'german-vocab' AND card."dictionaryWordId" IS NULL
        AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = card."userId")
      ORDER BY "createdAt", id
    `) as UnlinkedLegacyCardRow[];
    for (const card of unlinkedCards) {
      const article = card.content.article ?? null;
      const identity = identityService.createIdentity({
        language: 'de',
        text: card.content.back,
        partOfSpeech: article ? 'noun' : 'other',
        grammar: {
          article,
          gender: card.content.gender ?? null,
          plurals: card.content.plural ? [card.content.plural] : [],
        },
      });
      const proposedLexemeId = stableResourceId(
        'lexeme', identity.language, identity.normalizedLemma,
        identity.partOfSpeech, identity.grammarDiscriminator,
      );
      await queryRunner.query(`
        INSERT INTO lexemes
          (id, language, "normalizedLemma", "displayText", "partOfSpeech",
           "grammarDiscriminator", grammar, phonetic, "cefrLevel", source, model)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NULL,'legacy-card',NULL)
        ON CONFLICT (language, "normalizedLemma", "partOfSpeech", "grammarDiscriminator") DO NOTHING
      `, [
        proposedLexemeId, identity.language, identity.normalizedLemma, identity.displayText,
        identity.partOfSpeech, identity.grammarDiscriminator,
        JSON.stringify({
          article,
          gender: card.content.gender ?? null,
          plurals: card.content.plural ? [card.content.plural] : [],
        }),
        card.content.phonetic ?? null,
      ]);
      const lexemes: Array<{ id: string }> = await queryRunner.query(`
        SELECT id FROM lexemes
        WHERE language = $1 AND "normalizedLemma" = $2
          AND "partOfSpeech" = $3 AND "grammarDiscriminator" = $4
      `, [identity.language, identity.normalizedLemma, identity.partOfSpeech, identity.grammarDiscriminator]);
      const lexemeId = lexemes[0].id;
      await queryRunner.query(`
        INSERT INTO lexeme_localizations
          (id, "lexemeId", language, translation, definition, synonyms, status,
           "contentVersion", "isActive", source, model)
        VALUES ($1,$2,'en',$3,NULL,'[]'::jsonb,'ready',1,true,'legacy-card',NULL)
        ON CONFLICT ("lexemeId", language, "contentVersion") DO NOTHING
      `, [stableResourceId('lexeme-localization', lexemeId, 'en', '1'), lexemeId, card.content.front]);

      const contextId = stableResourceId('learning-context', card.userId, 'en', 'de');
      await queryRunner.query(`
        INSERT INTO learning_contexts
          (id, "userId", "sourceLanguage", "targetLanguage", "isActive")
        VALUES ($1::varchar,$2::varchar,'en','de',
          NOT EXISTS (SELECT 1 FROM learning_contexts WHERE "userId" = $2::varchar AND "isActive" = true))
        ON CONFLICT ("userId", "sourceLanguage", "targetLanguage") DO NOTHING
      `, [contextId, card.userId]);
      const contexts: Array<{ id: string }> = await queryRunner.query(`
        SELECT id FROM learning_contexts
        WHERE "userId" = $1 AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de'
      `, [card.userId]);
      const canonicalContextId = contexts[0].id;
      await queryRunner.query(`
        INSERT INTO learning_items
          (id, "userId", "learningContextId", "lexemeId", "legacyCardId",
           "personalNote", "customImageUrl", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$1,$5,$6,$7,$8)
        ON CONFLICT ("userId", "learningContextId", "lexemeId") DO NOTHING
      `, [
        card.id, card.userId, canonicalContextId, lexemeId,
        card.content.notes ?? '', card.content.imageUrl ?? null, card.createdAt, card.updatedAt,
      ]);
      const items: Array<{ id: string }> = await queryRunner.query(`
        SELECT id FROM learning_items
        WHERE "userId" = $1 AND "learningContextId" = $2 AND "lexemeId" = $3
      `, [card.userId, canonicalContextId, lexemeId]);
      if (card.collectionId) {
        await queryRunner.query(`
          UPDATE collections
          SET "learningContextId" = $2,
              "coverSeed" = COALESCE("coverSeed", lower(trim(name)))
          WHERE id = $1 AND "userId" = $3
        `, [card.collectionId, canonicalContextId, card.userId]);
        await queryRunner.query(`
          INSERT INTO user_collection_items ("collectionId", "learningItemId", position)
          VALUES ($1::varchar,$2::varchar,(
            SELECT COALESCE(MAX(position) + 1, 0) FROM user_collection_items WHERE "collectionId" = $1::varchar
          ))
          ON CONFLICT ("collectionId", "learningItemId") DO NOTHING
        `, [card.collectionId, items[0].id]);
      }
    }

    const audioRows = await queryRunner.query(`
      SELECT "displayText", language, "audioUrl", "storagePath", "durationMs", status, "failedAt"
      FROM word_audio
      WHERE lower(split_part(language, '-', 1)) = 'de'
      ORDER BY id
    `) as LegacyAudioRow[];
    const speechIdentity = new SpeechIdentityService();
    const voiceKey = process.env['GOOGLE_CLOUD_TTS_VOICE'] || 'de-DE-Chirp3-HD-Charon';
    for (const audio of audioRows) {
      const identity = speechIdentity.createIdentity({
        language: audio.language,
        text: audio.displayText,
        voiceKey,
        profileVersion: 1,
        contentKind: 'word',
      });
      await queryRunner.query(`
        INSERT INTO speech_assets
          (id, "identityKey", language, "normalizedText", "displayText", "voiceKey",
           "profileVersion", "contentKind", status, "attemptCount", "nextRetryAt",
           "audioUrl", "storagePath", "mimeType", "durationMs", "failureReason")
        VALUES ($1,$2,$3,$4,$5,$6,1,'word',$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT ("identityKey") DO NOTHING
      `, [
        stableResourceId('speech-asset', identity.identityKey), identity.identityKey,
        identity.language, identity.normalizedText, identity.displayText, identity.voiceKey,
        audio.status, audio.status === 'failed' ? 1 : 0, audio.failedAt,
        audio.audioUrl, audio.storagePath,
        audio.storagePath?.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
        audio.durationMs, audio.status === 'failed' ? 'legacy_generation_failed' : null,
      ]);
    }

    await queryRunner.query(`
      UPDATE cards
      SET "updatedAt" = "updatedAt"
      WHERE "contextId" = 'german-vocab' AND "dictionaryWordId" IS NOT NULL
    `);

    const unresolved: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS count
      FROM cards card
      LEFT JOIN legacy_dictionary_lexemes mapping
        ON mapping."dictionaryWordId" = card."dictionaryWordId"
      WHERE card."contextId" = 'german-vocab'
        AND card."dictionaryWordId" IS NOT NULL
        AND mapping."dictionaryWordId" IS NULL
    `);
    if (Number(unresolved[0]?.count ?? 0) > 0) {
      throw new Error(`Canonical learning-item backfill left ${unresolved[0].count} dictionary-linked cards unresolved`);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_migration_markers (
        key varchar PRIMARY KEY,
        "completedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO data_migration_markers (key)
      VALUES ('canonical-learning-items-v2')
      ON CONFLICT (key) DO UPDATE SET "completedAt" = now()
    `);
  }

  async down(): Promise<void> {
    // Canonical vocabulary and learning state may have received new references after
    // this migration, so reversing the data projection would be destructive.
  }
}
