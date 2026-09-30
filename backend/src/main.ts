import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { API_VERSION_V1 } from './api-version.js';
import { AppModule, ObserveInstrument } from './app.module.js';

/** Header name used to pass the API key (see the future auth guard). */
export const X_API_KEY = 'x-api-key';

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

  const config = new DocumentBuilder()
    .setTitle('Kaufman Bot')
    .setDescription('The Kaufman Bot API description')
    .setVersion('1.0')
    // Add the API key security definition
    .addApiKey(
      {
        type: 'apiKey',
        name: X_API_KEY, // The name of the header
        in: 'header', // The location (header, query, or cookie)
        description: 'Enter your API key',
      },
      'api_key', // A unique name for the security scheme reference
    )
    .build();

  Logger.log('Generating Swagger documentation');
  const document = SwaggerModule.createDocument(app, config);
  try {
    Logger.log('Writing Swagger documentation to file');
    writeFileSync('./swagger.json', JSON.stringify(document));
  } catch (error) {
    Logger.error(String(error));
  }
  Logger.log('Swagger documentation generated');

  SwaggerModule.setup('swagger', app, document);

  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`Application is running on port ${process.env.PORT ?? 3000}`);
}
await bootstrap();
