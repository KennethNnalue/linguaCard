import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { CardEntity } from '../cards/card.entity';
import { CollectionEntity } from '../collections/collection.entity';
import { CategoryEntity } from '../categories/category.entity';
import { UserEntity } from '../auth/user.entity';
import { StoryEntity } from '../stories/story.entity';
import { WordAudioEntity } from '../word-audio/word-audio.entity';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  ssl: process.env['NODE_ENV'] === 'production'
    ? { rejectUnauthorized: false }
    : false,
  entities: [UserEntity, CardEntity, CollectionEntity, CategoryEntity, StoryEntity, WordAudioEntity],
  synchronize: true,
  logging: process.env['NODE_ENV'] !== 'production',
}));
