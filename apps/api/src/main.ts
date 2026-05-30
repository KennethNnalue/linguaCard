import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const allowedOrigins = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',')
    : ['http://localhost:4200', 'http://localhost:8100'];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`API running at http://localhost:${port}/api/v1`);
}

bootstrap();
