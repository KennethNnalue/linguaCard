import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { extname, join } from 'path';

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor() {
    const accountId = process.env['R2_ACCOUNT_ID'] ?? '';
    const accessKeyId = process.env['R2_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
    this.bucket = process.env['R2_BUCKET'] ?? '';
    this.publicBaseUrl = (process.env['R2_PUBLIC_URL'] ?? '').replace(/\/$/, '');

    if (accountId && accessKeyId && secretAccessKey && this.bucket) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(`Storage: Cloudflare R2 bucket "${this.bucket}"`);
    } else {
      this.s3 = null;
      this.logger.log('Storage: local disk (R2 not configured)');
    }
  }

  async upload(buffer: Buffer, path: string, contentType: string): Promise<string> {
    if (this.s3) {
      return this.uploadToR2(buffer, path, contentType);
    }
    return this.saveToLocalDisk(buffer, path);
  }

  /**
   * Returns the public URL for a path if the object already exists in R2,
   * or null if it doesn't exist or R2 is not configured.
   * Used to skip TTS generation when audio was already uploaded in a previous run.
   */
  async getUrlIfExists(path: string): Promise<string | null> {
    if (!this.s3) {
      // Local disk — check filesystem
      const fullPath = join(this.uploadsDir, path);
      try {
        const { stat } = await import('fs/promises');
        const s = await stat(fullPath);
        if (s.size > 0) {
          const baseUrl = process.env['API_PUBLIC_URL']?.replace(/\/$/, '') ?? 'http://localhost:3001';
          return `${baseUrl}/uploads/${path}`;
        }
      } catch {
        // File doesn't exist
      }
      return null;
    }

    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
      return `${this.publicBaseUrl}/${path}`;
    } catch {
      return null;
    }
  }

  async read(path: string): Promise<StoredFile | null> {
    if (this.s3) {
      try {
        const result = await this.s3.send(new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
        }));
        if (!result.Body) return null;
        return {
          buffer: Buffer.from(await result.Body.transformToByteArray()),
          contentType: result.ContentType ?? this.contentTypeForPath(path),
        };
      } catch (error: unknown) {
        if (this.isMissingObjectError(error)) return null;
        throw error;
      }
    }

    try {
      return {
        buffer: await readFile(join(this.uploadsDir, path)),
        contentType: this.contentTypeForPath(path),
      };
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  private async uploadToR2(buffer: Buffer, path: string, contentType: string): Promise<string> {
    await this.s3!.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: buffer,
      ContentType: contentType,
    }));

    // R2_PUBLIC_URL is your bucket's public domain, e.g. https://audio.linguacard.app
    // or the r2.dev subdomain Cloudflare provides on the free plan.
    return `${this.publicBaseUrl}/${path}`;
  }

  async delete(path: string): Promise<void> {
    try {
      await this.deleteOrThrow(path);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown storage error';
      this.logger.warn(`Storage delete failed for "${path}": ${message}`);
    }
  }

  async deleteOrThrow(path: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: path }));
      return;
    }

    try {
      await unlink(join(this.uploadsDir, path));
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return;
      throw error;
    }
  }

  private async saveToLocalDisk(buffer: Buffer, path: string): Promise<string> {
    const fullPath = join(this.uploadsDir, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
    const baseUrl = process.env['API_PUBLIC_URL']?.replace(/\/$/, '') ?? 'http://localhost:3001';
    return `${baseUrl}/uploads/${path}`;
  }

  private contentTypeForPath(path: string): string {
    const extension = extname(path).toLowerCase();
    if (extension === '.mp3') return 'audio/mpeg';
    if (extension === '.wav') return 'audio/wav';
    return 'application/octet-stream';
  }

  private isMissingObjectError(error: unknown): boolean {
    if (!isRecord(error)) return false;
    const metadata = error['$metadata'];
    const statusCode = isRecord(metadata) ? metadata['httpStatusCode'] : undefined;
    return error['name'] === 'NoSuchKey' || error['Code'] === 'NoSuchKey' || statusCode === 404;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
