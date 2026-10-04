import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairAuditedVocabulary1787459000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await this.repair(queryRunner, 'also (Meine Mutter ist Italienerin', 'also', 'also (meine mutter ist italienerin', 'also',
      'to talk / speak', 'to talk / chat');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await this.repair(queryRunner, 'also', 'also (Meine Mutter ist Italienerin', 'also', 'also (meine mutter ist italienerin',
      'to talk / chat', 'to talk / speak');
  }
  private async repair(queryRunner: QueryRunner, oldWord: string, newWord: string, oldLemma: string, newLemma: string,
    oldCue: string, newCue: string): Promise<void> {
    await queryRunner.query(`WITH corrected AS (
      UPDATE lexemes SET "displayText"=$2, "normalizedLemma"=$4, "updatedAt"=now()
      WHERE id='3face452-ac25-5be5-a144-431eb13d0cdd' AND source='admin'
        AND model='podcast-transcript-import' AND "displayText"=$1 AND "normalizedLemma"=$3
      RETURNING id)
      UPDATE cards card SET content=jsonb_set(card.content,'{back}',to_jsonb($2::text)), version=card.version+1,"updatedAt"=now()
      FROM learning_items item, corrected WHERE item."lexemeId"=corrected.id
        AND card.id=item."legacyCardId" AND card.content->>'back'=$1`, [oldWord,newWord,oldLemma,newLemma]);
    await queryRunner.query(`WITH corrected AS (
      UPDATE lexeme_localizations SET translation=$2,"updatedAt"=now()
      WHERE id='2c28786652005e5d001795f2d15de2ee' AND "lexemeId"='335d6d49d5c6c8064b66d574eb5e8537'
        AND language='en' AND source='user' AND "isActive" AND translation=$1 RETURNING "lexemeId")
      UPDATE cards card SET content=jsonb_set(card.content,'{front}',to_jsonb($2::text)),version=card.version+1,"updatedAt"=now()
      FROM learning_items item,corrected WHERE item."lexemeId"=corrected."lexemeId"
        AND card.id=item."legacyCardId" AND card.content->>'front'=$1`,[oldCue,newCue]);
  }
}
