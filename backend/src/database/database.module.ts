import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Env } from '../config/env.schema.js';
import { DatabaseBootstrap } from './database-bootstrap.service.js';
import * as schema from './schema/index.js';

/** Typed database handle; inject with @InjectDrizzle(). */
export type Database = NodePgDatabase<typeof schema>;

/** PostgreSQL through Drizzle (@nestjs/drizzle), one pool per app instance; migrates on start. */
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        db: drizzle({ connection: { connectionString: config.get('DATABASE_URL', { infer: true }), max: 10 }, schema, casing: 'snake_case' }),
      }),
    }),
  ],
  providers: [DatabaseBootstrap],
})
export class DatabaseModule {}
