import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Image import sends base64-encoded images in JSON.
  // 5 MB raw file → ~6.7 MB base64 + JSON overhead; set limit with headroom.
  app.use(require('express').json({ limit: '10mb' }));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const allowedOrigins = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',')
    : ['http://localhost:4200', 'http://localhost:8100'];

  // CORS must be enabled before useStaticAssets so that fetch() calls from the
  // web client (http://localhost:4200) can download audio files for IndexedDB
  // caching. Static middleware runs outside the NestJS CORS interceptor, so we
  // attach the header manually via the setHeaders option.
  app.enableCors({ origin: allowedOrigins, credentials: true });

  // Audio files are content-addressed (SHA-256 in the filename) — immutable.
  // Cache for 1 year. CORS header added so the web client can fetch() them.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    maxAge: '1y',
    immutable: true,
    setHeaders(res) {
      const origin = res.req.headers['origin'];
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    },
  });

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`API running at http://0.0.0.0:${port}/api/v1`);
}

bootstrap();
