import { join } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Env } from '../config/env.schema.js';
import type { Database } from './database.module.js';
import { CITIES } from './reference/cities.js';
import { cities } from './schema/index.js';

/**
 * Brings the database up to date before the app serves traffic: pending migrations,
 * then the reference cities. Demo data is never loaded here (that is `npm run db:seed`,
 * for development and tests only).
 */
@Injectable()
export class DatabaseBootstrap implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrap.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('DB_MIGRATE_ON_START', { infer: true })) {
      await migrate(this.db, { migrationsFolder: join(import.meta.dirname, 'migrations') });
    }
    await this.db
      .insert(cities)
      .values(CITIES)
      .onConflictDoUpdate({
        target: cities.id,
        set: { slug: sql`excluded.slug`, name: sql`excluded.name`, country: sql`excluded.country`, center: sql`excluded.center`, bounds: sql`excluded.bounds` },
      });
    this.logger.log('database ready');
  }
}
