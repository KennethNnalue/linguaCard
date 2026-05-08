import { Module } from '@nestjs/common';
import { CardsModule } from './cards/cards.module';
import { CollectionsModule } from './collections/collections.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [CardsModule, CollectionsModule, CategoriesModule],
})
export class AppModule {}
