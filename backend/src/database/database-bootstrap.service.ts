import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Env } from '../config/env.schema.js';
import type { Database } from './database.module.js';
import migrationsSnapshot from './migrations-snapshot.json';
import { CITIES } from './reference/cities.js';
import { cities, users } from './schema/index.js';
import demoStateSnapshot from './seed/demo-state.json';
import { importGoState } from './seed/import-go-state.js';

function resolveExistingPath(candidates: string[]): string | undefined {
  return candidates.find((p) => existsSync(p));
}

function materializeBundledMigrations(files: Record<string, string>): string {
  const dir = '/tmp/seatiko-migrations';
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(dir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, 'utf8');
  }
  return dir;
}

/**
 * Brings the database up to date before the app serves traffic: pending migrations,
 * then the reference cities. Demo data is loaded automatically only when explicitly
 * enabled via SEED_DEMO_ON_EMPTY_DB=true and the users table is still empty.
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
      let migrationsFolder = resolveExistingPath([
        join(__dirname, 'migrations'),
        join(process.cwd(), 'dist/database/migrations'),
        join(process.cwd(), 'src/database/migrations'),
        join(process.cwd(), 'backend/dist/database/migrations'),
        join(process.cwd(), 'backend/src/database/migrations'),
      ]);
      if (!migrationsFolder && Object.keys(migrationsSnapshot).length > 0) {
        migrationsFolder = materializeBundledMigrations(migrationsSnapshot as Record<string, string>);
      }
      if (migrationsFolder) {
        await migrate(this.db, { migrationsFolder });
      } else {
        this.logger.warn('migrations folder not found; skipping auto-migrate');
      }
    }
    await this.db
      .insert(cities)
      .values(CITIES)
      .onConflictDoUpdate({
        target: cities.id,
        set: { slug: sql`excluded.slug`, name: sql`excluded.name`, country: sql`excluded.country`, center: sql`excluded.center`, bounds: sql`excluded.bounds` },
      });

    if (this.config.get('SEED_DEMO_ON_EMPTY_DB', { infer: true })) {
      await this.seedDemoIfEmpty();
    }
    this.logger.log('database ready');
  }

  private async seedDemoIfEmpty(): Promise<void> {
    const [existingUser] = await this.db.select({ id: users.id }).from(users).limit(1);
    if (existingUser) return;
    const demoPath = resolveExistingPath([
      join(__dirname, 'seed/demo-state.json'),
      join(process.cwd(), 'dist/database/seed/demo-state.json'),
      join(process.cwd(), 'src/database/seed/demo-state.json'),
      join(process.cwd(), 'backend/dist/database/seed/demo-state.json'),
      join(process.cwd(), 'backend/src/database/seed/demo-state.json'),
    ]);
    const demo = (demoPath
      ? JSON.parse(readFileSync(demoPath, 'utf8'))
      : demoStateSnapshot) as { generated_at: string; state: unknown };
    const shiftMs = Date.now() - new Date(demo.generated_at).getTime();
    const report = await importGoState(this.db, demo.state as never, { replace: true, shiftMs });
    this.logger.log(`seeded demo data into empty database: ${JSON.stringify(report)}`);
  }
}
