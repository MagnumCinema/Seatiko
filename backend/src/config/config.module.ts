import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema.js';

/** Global, validated configuration. Modules read settings only through ConfigService<Env, true>. */
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv })],
})
export class ConfigModule {}
