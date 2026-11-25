import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { listenAddress, type Env } from './config/env.schema.js';
import { createValidationPipe } from './core/http/validation.js';
import { openApiDocument } from './modules/docs/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { instrument: ObserveInstrument });
  app.useGlobalPipes(createValidationPipe());
  // Same CORS policy as the Go API (any origin; browsers call through nginx anyway).
  app.enableCors({ origin: '*', allowedHeaders: ['Authorization', 'Content-Type', 'Accept'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.enableShutdownHooks();
  SwaggerModule.setup('api/docs', app, openApiDocument() as never, { swaggerOptions: { url: '/api/openapi.yaml' } });

  const config = app.get(ConfigService<Env, true>);
  const { host, port } = listenAddress({ ADDR: config.get('ADDR', { infer: true }), PORT: config.get('PORT', { infer: true }) });
  await app.listen(port, host ?? '0.0.0.0');
}
await bootstrap();
