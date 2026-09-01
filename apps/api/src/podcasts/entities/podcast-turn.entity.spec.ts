import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { getMetadataArgsStorage } from 'typeorm';
import { PodcastTurnEntity } from './podcast-turn.entity';

describe('PodcastTurnEntity metadata', () => {
  it.each(['startMs', 'endMs'])('maps nullable %s to a PostgreSQL integer', propertyName => {
    const column = getMetadataArgsStorage().columns.find(
      metadata => metadata.target === PodcastTurnEntity && metadata.propertyName === propertyName,
    );

    expect(column?.options).toEqual(expect.objectContaining({ type: 'integer', nullable: true }));
  });
});
