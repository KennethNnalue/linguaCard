import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

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

  private async saveToLocalDisk(buffer: Buffer, path: string): Promise<string> {
    const fullPath = join(this.uploadsDir, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
    const baseUrl = process.env['API_PUBLIC_URL']?.replace(/\/$/, '') ?? 'http://localhost:3001';
    return `${baseUrl}/uploads/${path}`;
  }
}
