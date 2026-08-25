import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteCanonicalCardProjection1787440000000 implements MigrationInterface {
  name = 'CompleteCanonicalCardProjection1787440000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [7_314_209_006]);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION project_legacy_card_to_learning_item(
        card_id varchar,
        card_user_id varchar,
        dictionary_word_id varchar,
        legacy_context_id varchar,
        collection_id varchar,
        card_content jsonb
      ) RETURNS void AS $$
      DECLARE
        mapped_lexeme_id varchar;
        context_id varchar;
        learning_item_id varchar;
        next_position integer;
        display_text varchar;
        normalized_lemma varchar;
        translation_text varchar;
        article_text varchar;
        gender_text varchar;
        plural_text varchar;
        inferred_part_of_speech varchar;
        grammar_discriminator varchar;
        example_record record;
        example_target varchar;
        example_source varchar;
        example_id varchar;
      BEGIN
        IF legacy_context_id <> 'german-vocab' THEN RETURN; END IF;
        IF NOT EXISTS (SELECT 1 FROM "users" WHERE id = card_user_id) THEN RETURN; END IF;

        display_text := NULLIF(trim(COALESCE(card_content->>'back', '')), '');
        translation_text := trim(COALESCE(card_content->>'front', ''));
        IF display_text IS NULL THEN RETURN; END IF;

        PERFORM pg_advisory_xact_lock(hashtext(card_user_id));

        IF dictionary_word_id IS NOT NULL THEN
          SELECT "lexemeId" INTO mapped_lexeme_id
          FROM "legacy_dictionary_lexemes"
          WHERE "dictionaryWordId" = dictionary_word_id;
        END IF;

        IF mapped_lexeme_id IS NULL THEN
          normalized_lemma := lower(regexp_replace(normalize(display_text, NFC), '\\s+', ' ', 'g'));
          article_text := NULLIF(trim(COALESCE(card_content->>'article', '')), '');
          gender_text := NULLIF(trim(COALESCE(card_content->>'gender', '')), '');
          plural_text := NULLIF(trim(COALESCE(card_content->>'plural', '')), '');
          inferred_part_of_speech := CASE WHEN article_text IS NULL THEN 'other' ELSE 'noun' END;
          grammar_discriminator := concat_ws('|', COALESCE(article_text, ''), COALESCE(gender_text, ''), COALESCE(plural_text, ''));
          mapped_lexeme_id := md5(concat_ws(chr(31), 'lexeme', 'de', normalized_lemma, inferred_part_of_speech, grammar_discriminator));

          INSERT INTO "lexemes" (
            id, language, "normalizedLemma", "displayText", "partOfSpeech",
            "grammarDiscriminator", grammar, phonetic, "cefrLevel", source, model
          ) VALUES (
            mapped_lexeme_id,
            'de',
            normalized_lemma,
            display_text,
            inferred_part_of_speech,
            grammar_discriminator,
            jsonb_build_object(
              'article', article_text,
              'gender', gender_text,
              'plurals', CASE WHEN plural_text IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(plural_text) END
            ),
            NULLIF(trim(COALESCE(card_content->>'phonetic', '')), ''),
            NULL,
            'user',
            NULL
          )
          ON CONFLICT (language, "normalizedLemma", "partOfSpeech", "grammarDiscriminator")
          DO UPDATE SET
            "displayText" = EXCLUDED."displayText",
            grammar = EXCLUDED.grammar,
            phonetic = COALESCE(EXCLUDED.phonetic, "lexemes".phonetic),
            "updatedAt" = now()
          RETURNING id INTO mapped_lexeme_id;
        END IF;

        INSERT INTO "lexeme_localizations" (
          id, "lexemeId", language, translation, definition, synonyms,
          status, "contentVersion", "isActive", source, model
        ) VALUES (
          md5(concat_ws(chr(31), 'lexeme-localization', mapped_lexeme_id, 'en', '1')),
          mapped_lexeme_id,
          'en',
          translation_text,
          NULLIF(trim(COALESCE(card_content->>'notes', '')), ''),
          COALESCE(card_content->'synonyms', '[]'::jsonb),
          'ready',
          1,
          true,
          'user',
          NULL
        )
        ON CONFLICT ("lexemeId", language, "contentVersion")
        DO UPDATE SET
          translation = EXCLUDED.translation,
          definition = EXCLUDED.definition,
          synonyms = EXCLUDED.synonyms,
          status = 'ready',
          "isActive" = true,
          "updatedAt" = now();

        FOR example_record IN
          SELECT value, ordinality - 1 AS position
          FROM jsonb_array_elements(COALESCE(card_content->'examples', '[]'::jsonb)) WITH ORDINALITY
        LOOP
          example_target := NULLIF(trim(COALESCE(example_record.value->>'target', '')), '');
          example_source := NULLIF(trim(COALESCE(example_record.value->>'native', '')), '');
          IF example_target IS NULL THEN CONTINUE; END IF;
          example_id := md5(concat_ws(chr(31), 'example-sentence', mapped_lexeme_id, 'de', lower(example_target)));
          INSERT INTO "example_sentences" (
            id, "lexemeId", language, "normalizedText", "displayText", position, source, model
          ) VALUES (
            example_id, mapped_lexeme_id, 'de', lower(example_target), example_target,
            example_record.position, 'user', NULL
          )
          ON CONFLICT ("lexemeId", language, "normalizedText")
          DO UPDATE SET "displayText" = EXCLUDED."displayText", position = EXCLUDED.position, "updatedAt" = now()
          RETURNING id INTO example_id;

          IF example_source IS NOT NULL THEN
            INSERT INTO "example_localizations" (
              id, "exampleSentenceId", language, text, status,
              "contentVersion", "isActive", source, model
            ) VALUES (
              md5(concat_ws(chr(31), 'example-localization', example_id, 'en', '1')),
              example_id, 'en', example_source, 'ready', 1, true, 'user', NULL
            )
            ON CONFLICT ("exampleSentenceId", language, "contentVersion")
            DO UPDATE SET text = EXCLUDED.text, status = 'ready', "isActive" = true, "updatedAt" = now();
          END IF;
        END LOOP;

        SELECT id INTO context_id FROM "learning_contexts"
        WHERE "userId" = card_user_id AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de';
        IF context_id IS NULL THEN
          context_id := md5(concat_ws(chr(31), 'learning-context', card_user_id, 'en', 'de'));
          INSERT INTO "learning_contexts" (id, "userId", "sourceLanguage", "targetLanguage", "isActive")
          VALUES (
            context_id,
            card_user_id,
            'en',
            'de',
            NOT EXISTS (SELECT 1 FROM "learning_contexts" WHERE "userId" = card_user_id AND "isActive" = true)
          )
          ON CONFLICT ("userId", "sourceLanguage", "targetLanguage") DO NOTHING;
          SELECT id INTO context_id FROM "learning_contexts"
          WHERE "userId" = card_user_id AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de';
        END IF;

        DELETE FROM "learning_items"
        WHERE "legacyCardId" = card_id AND "lexemeId" <> mapped_lexeme_id;

        INSERT INTO "learning_items"
          (id, "userId", "learningContextId", "lexemeId", "legacyCardId", "personalNote", "customImageUrl")
        VALUES (
          card_id, card_user_id, context_id, mapped_lexeme_id, card_id,
          COALESCE(card_content->>'notes', ''), NULLIF(card_content->>'imageUrl', '')
        )
        ON CONFLICT ("userId", "learningContextId", "lexemeId") DO UPDATE SET
          "personalNote" = EXCLUDED."personalNote",
          "customImageUrl" = EXCLUDED."customImageUrl",
          "updatedAt" = now();

        SELECT id INTO learning_item_id FROM "learning_items"
        WHERE "userId" = card_user_id AND "learningContextId" = context_id AND "lexemeId" = mapped_lexeme_id;

        IF collection_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM "collections" WHERE id = collection_id AND "userId" = card_user_id) THEN
            RAISE EXCEPTION 'Collection % does not belong to user %', collection_id, card_user_id;
          END IF;
          UPDATE "collections"
          SET "learningContextId" = COALESCE("learningContextId", context_id),
              "coverSeed" = COALESCE("coverSeed", lower(trim(regexp_replace(name, '\\s+', ' ', 'g'))))
          WHERE id = collection_id AND "userId" = card_user_id;
          IF EXISTS (
            SELECT 1 FROM "collections"
            WHERE id = collection_id AND "userId" = card_user_id
              AND "learningContextId" IS DISTINCT FROM context_id
          ) THEN
            RAISE EXCEPTION 'Collection % belongs to a different learning context', collection_id;
          END IF;
          PERFORM pg_advisory_xact_lock(hashtext(collection_id));
          SELECT COALESCE(MAX(position) + 1, 0) INTO next_position
          FROM "user_collection_items" WHERE "collectionId" = collection_id;
          INSERT INTO "user_collection_items" ("collectionId", "learningItemId", position)
          VALUES (collection_id, learning_item_id, next_position)
          ON CONFLICT ("collectionId", "learningItemId") DO NOTHING;
        END IF;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION synchronize_legacy_card_learning_item()
      RETURNS trigger AS $$
      DECLARE
        linked_learning_item_id varchar;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          DELETE FROM "learning_items" WHERE "legacyCardId" = OLD.id;
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD."collectionId" IS DISTINCT FROM NEW."collectionId" THEN
          SELECT id INTO linked_learning_item_id
          FROM "learning_items"
          WHERE "legacyCardId" = OLD.id;
          IF OLD."collectionId" IS NOT NULL AND linked_learning_item_id IS NOT NULL THEN
            DELETE FROM "user_collection_items"
            WHERE "collectionId" = OLD."collectionId"
              AND "learningItemId" = linked_learning_item_id;
          END IF;
        END IF;

        PERFORM project_legacy_card_to_learning_item(
          NEW.id,
          NEW."userId",
          NEW."dictionaryWordId",
          NEW."contextId",
          NEW."collectionId",
          NEW.content
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  async down(): Promise<void> {}
}
