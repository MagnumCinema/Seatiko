import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { listenAddress, type Env } from './config/env.schema.js';
import { createValidationPipe } from './core/http/validation.js';
import { openApiDocument } from './modules/docs/openapi.js';
import { json } from 'express';
import { GROQ_PROXY_PATH } from './integrations/groq/groq-proxy.controller.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { instrument: ObserveInstrument, rawBody: true, bodyParser: false });
  // The CRM's AI requests (tool definitions, history) outgrow the 100 KB default; only that
  // internal route gets a larger limit, parsed first so the default parsers skip it.
  app.use(GROQ_PROXY_PATH, json({ limit: '20mb' }));
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.useGlobalPipes(createValidationPipe());
  // Behind nginx: the client address (rate limits) comes from X-Forwarded-For.
  app.set('trust proxy', true);
  // Same CORS policy as the Go API (any origin; browsers call through nginx anyway).
  app.enableCors({ origin: '*', allowedHeaders: ['Authorization', 'Content-Type', 'Accept'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.enableShutdownHooks();
  // Local media (no S3_BUCKET): avatars and photos under /uploads, as the Go API.
  const media = app.get(ConfigService<Env, true>);
  if (!media.get('S3_BUCKET', { infer: true })) app.useStaticAssets(media.get('UPLOAD_DIR', { infer: true }), { prefix: '/uploads/' });
  SwaggerModule.setup('api/docs', app, openApiDocument() as never, { swaggerOptions: { url: '/api/openapi.yaml' } });

  const config = app.get(ConfigService<Env, true>);
  const { host, port } = listenAddress({ ADDR: config.get('ADDR', { infer: true }), PORT: config.get('PORT', { infer: true }) });
  await app.listen(port, host ?? '0.0.0.0');
}
await bootstrap();
