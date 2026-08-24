import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLearningItems1787437000000 implements MigrationInterface {
  name = 'CreateLearningItems1787437000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [7_314_209_004]);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_dictionary_lexemes" (
        "dictionaryWordId" varchar PRIMARY KEY,
        "lexemeId" varchar NOT NULL REFERENCES "lexemes"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_legacy_dictionary_lexemes_lexeme"
      ON "legacy_dictionary_lexemes" ("lexemeId")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "learning_contexts" (
        "id" varchar PRIMARY KEY,
        "userId" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "sourceLanguage" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "targetLanguage" varchar(10) NOT NULL REFERENCES "languages"("code"),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_learning_contexts_pair" UNIQUE ("userId", "sourceLanguage", "targetLanguage"),
        CONSTRAINT "ck_learning_contexts_different_languages" CHECK ("sourceLanguage" <> "targetLanguage")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_learning_contexts_user" ON "learning_contexts" ("userId")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_learning_contexts_active_user"
      ON "learning_contexts" ("userId") WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "learning_items" (
        "id" varchar PRIMARY KEY,
        "userId" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "learningContextId" varchar NOT NULL REFERENCES "learning_contexts"("id") ON DELETE CASCADE,
        "lexemeId" varchar NOT NULL REFERENCES "lexemes"("id"),
        "legacyCardId" varchar,
        "personalNote" text NOT NULL DEFAULT '',
        "customImageUrl" varchar(1000),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_learning_items_user_context_lexeme" UNIQUE ("userId", "learningContextId", "lexemeId"),
        CONSTRAINT "uq_learning_items_legacy_card" UNIQUE ("legacyCardId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_learning_items_user_context" ON "learning_items" ("userId", "learningContextId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_learning_items_lexeme" ON "learning_items" ("lexemeId")`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_collection_items" (
        "collectionId" varchar NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
        "learningItemId" varchar NOT NULL REFERENCES "learning_items"("id") ON DELETE CASCADE,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_collection_items" PRIMARY KEY ("collectionId", "learningItemId"),
        CONSTRAINT "ck_user_collection_items_position" CHECK ("position" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_user_collection_items_learning_item" ON "user_collection_items" ("learningItemId")`);
    await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "learningContextId" varchar`);
    await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "coverSeed" varchar(200)`);
    await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "coverImageUrl" varchar(1000)`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "collections"
          ADD CONSTRAINT "fk_collections_learning_context"
          FOREIGN KEY ("learningContextId") REFERENCES "learning_contexts"("id");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_collections_learningContextId" ON "collections" ("learningContextId")`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION synchronize_legacy_collection_learning_context()
      RETURNS trigger AS $$
      DECLARE context_id varchar;
      BEGIN
        IF NEW."contextId" <> 'german-vocab' THEN RETURN NEW; END IF;
        IF NOT EXISTS (SELECT 1 FROM "users" WHERE id = NEW."userId") THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtext(NEW."userId"));
        SELECT id INTO context_id FROM "learning_contexts"
        WHERE "userId" = NEW."userId" AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de';
        IF context_id IS NULL THEN
          context_id := md5('learning-context:' || NEW."userId" || ':en:de');
          INSERT INTO "learning_contexts" (id, "userId", "sourceLanguage", "targetLanguage", "isActive")
          VALUES (
            context_id,
            NEW."userId",
            'en',
            'de',
            NOT EXISTS (SELECT 1 FROM "learning_contexts" WHERE "userId" = NEW."userId" AND "isActive" = true)
          )
          ON CONFLICT ("userId", "sourceLanguage", "targetLanguage") DO NOTHING;
          SELECT id INTO context_id FROM "learning_contexts"
          WHERE "userId" = NEW."userId" AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de';
        END IF;
        NEW."learningContextId" := context_id;
        NEW."coverSeed" := COALESCE(
          NEW."coverSeed",
          lower(trim(regexp_replace(NEW.name, '\\s+', ' ', 'g')))
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_collections_learning_context_sync" ON "collections"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_collections_learning_context_sync"
      BEFORE INSERT OR UPDATE OF "contextId", name ON "collections"
      FOR EACH ROW EXECUTE FUNCTION synchronize_legacy_collection_learning_context()
    `);
    await queryRunner.query(`
      UPDATE "collections" collection
      SET name = collection.name
      FROM "users" owner
      WHERE collection."contextId" = 'german-vocab'
        AND owner.id = collection."userId"
    `);

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
      BEGIN
        IF dictionary_word_id IS NULL OR legacy_context_id <> 'german-vocab' THEN
          RETURN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "users" WHERE id = card_user_id) THEN RETURN; END IF;

        PERFORM pg_advisory_xact_lock(hashtext(card_user_id));

        SELECT "lexemeId" INTO mapped_lexeme_id
        FROM "legacy_dictionary_lexemes"
        WHERE "dictionaryWordId" = dictionary_word_id;
        IF mapped_lexeme_id IS NULL THEN RETURN; END IF;

        SELECT id INTO context_id FROM "learning_contexts"
        WHERE "userId" = card_user_id AND "sourceLanguage" = 'en' AND "targetLanguage" = 'de';
        IF context_id IS NULL THEN
          context_id := md5('learning-context:' || card_user_id || ':en:de');
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

        INSERT INTO "learning_items"
          (id, "userId", "learningContextId", "lexemeId", "legacyCardId", "personalNote", "customImageUrl")
        VALUES (
          card_id, card_user_id, context_id, mapped_lexeme_id, card_id,
          COALESCE(card_content->>'notes', ''), NULLIF(card_content->>'imageUrl', '')
        )
        ON CONFLICT ("userId", "learningContextId", "lexemeId") DO NOTHING;

        SELECT id INTO learning_item_id FROM "learning_items"
        WHERE "userId" = card_user_id AND "learningContextId" = context_id AND "lexemeId" = mapped_lexeme_id;

        IF collection_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM "collections" WHERE id = collection_id AND "userId" = card_user_id
          ) THEN
            RAISE EXCEPTION 'Collection % does not belong to user %', collection_id, card_user_id;
          END IF;

          UPDATE "collections"
          SET "learningContextId" = COALESCE("learningContextId", context_id),
              "coverSeed" = COALESCE("coverSeed", lower(trim(regexp_replace(name, '\\s+', ' ', 'g'))))
          WHERE id = collection_id AND "userId" = card_user_id;

          IF EXISTS (
            SELECT 1 FROM "collections"
            WHERE id = collection_id
              AND "userId" = card_user_id
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
        RETURN;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION synchronize_legacy_card_learning_item()
      RETURNS trigger AS $$
      DECLARE
        linked_learning_item_id varchar;
        replacement_card_id varchar;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          SELECT li.id INTO linked_learning_item_id
          FROM "learning_items" li
          JOIN "learning_contexts" lc ON lc.id = li."learningContextId"
          JOIN "legacy_dictionary_lexemes" map ON map."lexemeId" = li."lexemeId"
          WHERE li."userId" = OLD."userId"
            AND lc."sourceLanguage" = 'en' AND lc."targetLanguage" = 'de'
            AND map."dictionaryWordId" = OLD."dictionaryWordId"
          LIMIT 1;
          IF OLD."collectionId" IS NOT NULL AND linked_learning_item_id IS NOT NULL THEN
            DELETE FROM "user_collection_items"
            WHERE "collectionId" = OLD."collectionId" AND "learningItemId" = linked_learning_item_id;
          END IF;

          IF linked_learning_item_id IS NOT NULL THEN
            SELECT card.id INTO replacement_card_id
            FROM "cards" card
            JOIN "legacy_dictionary_lexemes" map
              ON map."dictionaryWordId" = card."dictionaryWordId"
            JOIN "learning_items" item
              ON item.id = linked_learning_item_id AND item."lexemeId" = map."lexemeId"
            WHERE card."userId" = OLD."userId"
              AND card."contextId" = 'german-vocab'
            ORDER BY card."createdAt" ASC, card.id ASC
            LIMIT 1;

            IF replacement_card_id IS NULL THEN
              DELETE FROM "learning_items" WHERE id = linked_learning_item_id;
            ELSIF EXISTS (
              SELECT 1 FROM "learning_items"
              WHERE id = linked_learning_item_id AND "legacyCardId" = OLD.id
            ) THEN
              UPDATE "learning_items"
              SET "legacyCardId" = replacement_card_id, "updatedAt" = now()
              WHERE id = linked_learning_item_id;
            END IF;

            IF replacement_card_id IS NOT NULL THEN
              PERFORM project_legacy_card_to_learning_item(
                card.id,
                card."userId",
                card."dictionaryWordId",
                card."contextId",
                card."collectionId",
                card.content
              )
              FROM "cards" card
              WHERE card.id = replacement_card_id;
            END IF;
          END IF;
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD."collectionId" IS DISTINCT FROM NEW."collectionId" THEN
          SELECT li.id INTO linked_learning_item_id
          FROM "learning_items" li
          JOIN "learning_contexts" lc ON lc.id = li."learningContextId"
          JOIN "legacy_dictionary_lexemes" map ON map."lexemeId" = li."lexemeId"
          WHERE li."userId" = OLD."userId"
            AND lc."sourceLanguage" = 'en' AND lc."targetLanguage" = 'de'
            AND map."dictionaryWordId" = OLD."dictionaryWordId"
          LIMIT 1;
          IF OLD."collectionId" IS NOT NULL AND linked_learning_item_id IS NOT NULL THEN
            DELETE FROM "user_collection_items"
            WHERE "collectionId" = OLD."collectionId" AND "learningItemId" = linked_learning_item_id;
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
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_cards_learning_item_sync" ON "cards"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_cards_learning_item_sync"
      AFTER INSERT OR UPDATE OR DELETE ON "cards"
      FOR EACH ROW EXECUTE FUNCTION synchronize_legacy_card_learning_item()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_cards_learning_item_sync" ON "cards"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_collections_learning_context_sync" ON "collections"`);
    await queryRunner.query('DROP FUNCTION IF EXISTS synchronize_legacy_card_learning_item()');
    await queryRunner.query('DROP FUNCTION IF EXISTS project_legacy_card_to_learning_item(varchar, varchar, varchar, varchar, varchar, jsonb)');
    await queryRunner.query('DROP FUNCTION IF EXISTS synchronize_legacy_collection_learning_context()');
    await queryRunner.query(`ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "fk_collections_learning_context"`);
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "coverImageUrl"`);
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "coverSeed"`);
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "learningContextId"`);
    await queryRunner.query('DROP TABLE IF EXISTS "user_collection_items"');
    await queryRunner.query('DROP TABLE IF EXISTS "learning_items"');
    await queryRunner.query('DROP TABLE IF EXISTS "learning_contexts"');
    await queryRunner.query('DROP TABLE IF EXISTS "legacy_dictionary_lexemes"');
  }
}
