import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { AiConfig } from '../config/ai.config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly useLocalDisk: boolean;
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    const bucket = config.get<AiConfig>('ai')!.storageBucket;
    this.useLocalDisk = !bucket || bucket === 'lingua-card-audio-dev';
  }

  async upload(buffer: Buffer, path: string, _contentType: string): Promise<string> {
    if (this.useLocalDisk) {
      return this.saveToLocalDisk(buffer, path);
    }
    // TODO: replace with real S3 upload when bucket is configured
    return this.saveToLocalDisk(buffer, path);
  }

  private async saveToLocalDisk(buffer: Buffer, path: string): Promise<string> {
    const fullPath = join(this.uploadsDir, path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, buffer);
    const baseUrl = 'http://localhost:3001';
    return `${baseUrl}/uploads/${path}`;
  }
}
