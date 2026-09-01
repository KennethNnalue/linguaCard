import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { StorageService } from '../../storage/storage.service';
import { PodcastThumbnailAssetEntity } from '../entities/podcast-thumbnail-asset.entity';

const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;
const HERO_WIDTH = 1280;
const HERO_HEIGHT = 720;
const MINIMUM_WIDTH = 960;
const MINIMUM_HEIGHT = 540;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TYPE_BY_FORMAT: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface PreparedPodcastThumbnail {
  entity: PodcastThumbnailAssetEntity;
  storagePaths: readonly string[];
}

interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

@Injectable()
export class PodcastThumbnailService {
  constructor(private readonly storage: StorageService) {}

  async prepare(
    buffer: Buffer,
    declaredMimeType: string,
    accessibilityDescription: string,
    focalPoint: { x: number; y: number },
  ): Promise<PreparedPodcastThumbnail> {
    if (!SUPPORTED_MIME_TYPES.has(declaredMimeType)) {
      throw new BadRequestException('Thumbnail must be a JPEG, PNG, or WebP image');
    }

    let normalized: Buffer;
    let width: number;
    let height: number;
    let detectedFormat: string;

    try {
      const metadata = await sharp(buffer).metadata();
      detectedFormat = metadata.format ?? '';
      if (!SUPPORTED_FORMATS.has(detectedFormat)) {
        throw new BadRequestException('Thumbnail file content must be JPEG, PNG, or WebP');
      }
      if (MIME_TYPE_BY_FORMAT[detectedFormat] !== declaredMimeType) {
        throw new BadRequestException('Thumbnail file content does not match its declared type');
      }
      const result = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
      normalized = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Thumbnail file is not a valid image');
    }

    if (width < MINIMUM_WIDTH || height < MINIMUM_HEIGHT) {
      throw new BadRequestException(
        `Thumbnail must be at least ${MINIMUM_WIDTH} × ${MINIMUM_HEIGHT} pixels`,
      );
    }

    const crop = calculateCoverCrop(width, height, HERO_WIDTH / HERO_HEIGHT, focalPoint);
    const [cardBuffer, heroBuffer] = await Promise.all([
      this.createVariant(normalized, crop, CARD_WIDTH, CARD_HEIGHT),
      this.createVariant(normalized, crop, HERO_WIDTH, HERO_HEIGHT),
    ]);

    const id = randomUUID();
    const extension = detectedFormat === 'jpeg' ? 'jpg' : detectedFormat;
    const originalStoragePath = `podcasts/thumbnails/${id}/original.${extension}`;
    const cardStoragePath = `podcasts/thumbnails/${id}/card.webp`;
    const heroStoragePath = `podcasts/thumbnails/${id}/hero.webp`;
    const storagePaths = [originalStoragePath, cardStoragePath, heroStoragePath] as const;

    try {
      const [originalUrl, cardUrl, heroUrl] = await Promise.all([
        this.storage.upload(normalized, originalStoragePath, MIME_TYPE_BY_FORMAT[detectedFormat]),
        this.storage.upload(cardBuffer, cardStoragePath, 'image/webp'),
        this.storage.upload(heroBuffer, heroStoragePath, 'image/webp'),
      ]);

      const entity = new PodcastThumbnailAssetEntity();
      entity.id = id;
      entity.originalUrl = originalUrl;
      entity.originalStoragePath = originalStoragePath;
      entity.originalMimeType = MIME_TYPE_BY_FORMAT[detectedFormat];
      entity.originalWidth = width;
      entity.originalHeight = height;
      entity.cardUrl = cardUrl;
      entity.cardStoragePath = cardStoragePath;
      entity.cardWidth = CARD_WIDTH;
      entity.cardHeight = CARD_HEIGHT;
      entity.heroUrl = heroUrl;
      entity.heroStoragePath = heroStoragePath;
      entity.heroWidth = HERO_WIDTH;
      entity.heroHeight = HERO_HEIGHT;
      entity.accessibilityDescription = accessibilityDescription.trim();
      entity.focalPointX = focalPoint.x;
      entity.focalPointY = focalPoint.y;
      entity.contentHash = createHash('sha256').update(normalized).digest('hex');
      entity.version = 1;
      return { entity, storagePaths };
    } catch (error) {
      await this.remove(storagePaths);
      throw error;
    }
  }

  async remove(storagePaths: readonly string[]): Promise<void> {
    await Promise.all(storagePaths.map(path => this.storage.delete(path)));
  }

  private createVariant(
    buffer: Buffer,
    crop: CropRegion,
    width: number,
    height: number,
  ): Promise<Buffer> {
    return sharp(buffer)
      .extract(crop)
      .resize(width, height, { fit: 'fill' })
      .webp({ quality: 82 })
      .toBuffer();
  }
}

export function calculateCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: number,
  focalPoint: { x: number; y: number },
): CropRegion {
  const sourceAspectRatio = sourceWidth / sourceHeight;
  if (sourceAspectRatio > targetAspectRatio) {
    const width = Math.round(sourceHeight * targetAspectRatio);
    const desiredLeft = Math.round(focalPoint.x * sourceWidth - width / 2);
    return {
      left: clamp(desiredLeft, 0, sourceWidth - width),
      top: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = Math.round(sourceWidth / targetAspectRatio);
  const desiredTop = Math.round(focalPoint.y * sourceHeight - height / 2);
  return {
    left: 0,
    top: clamp(desiredTop, 0, sourceHeight - height),
    width: sourceWidth,
    height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
