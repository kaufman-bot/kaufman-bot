import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_VERSION_V1 } from './api-version.js';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.enableCors();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: API_VERSION_V1,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
