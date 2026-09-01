import { PodcastEpisodeEntity } from './podcast-episode.entity';
import { PodcastThumbnailAssetEntity } from './podcast-thumbnail-asset.entity';
import { PodcastTopicEntity } from './podcast-topic.entity';
import { PodcastSpeakerEntity } from './podcast-speaker.entity';
import { PodcastTurnEntity } from './podcast-turn.entity';
import { PodcastEpisodeVocabularyEntity } from './podcast-episode-vocabulary.entity';
import { PodcastListeningProgressEntity } from './podcast-listening-progress.entity';

export const PODCAST_ENTITIES = [
  PodcastTopicEntity,
  PodcastEpisodeEntity,
  PodcastThumbnailAssetEntity,
  PodcastSpeakerEntity,
  PodcastTurnEntity,
  PodcastEpisodeVocabularyEntity,
  PodcastListeningProgressEntity,
];
