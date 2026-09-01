import type { PodcastThumbnail } from '@lingua-card/shared/domain';
import { PodcastThumbnailAssetEntity } from './entities/podcast-thumbnail-asset.entity';

export function toPodcastThumbnail(entity: PodcastThumbnailAssetEntity): PodcastThumbnail {
  return {
    assetId: entity.id,
    cardUrl: entity.cardUrl,
    cardWidth: entity.cardWidth,
    cardHeight: entity.cardHeight,
    heroUrl: entity.heroUrl,
    heroWidth: entity.heroWidth,
    heroHeight: entity.heroHeight,
    accessibilityDescription: entity.accessibilityDescription,
    focalPoint: { x: entity.focalPointX, y: entity.focalPointY },
    version: entity.version,
  };
}
