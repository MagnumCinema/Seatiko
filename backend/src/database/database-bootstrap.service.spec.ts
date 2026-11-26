import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { MIGRATION_LOCK_KEY, migrateWithLock } from './database-bootstrap.service.js';
import type { Database } from './database.module.js';

function fakeDb() {
  const steps: string[] = [];
  const released: unknown[] = [];
  const client = {
    query: async (q: string, params: unknown[]) => void steps.push(`${q} ${JSON.stringify(params)}`),
    release: (error?: unknown) => void released.push(error),
  };
  const db = { $client: { connect: async () => client } } as unknown as Database;
  return { db, steps, released };
}

describe('migrateWithLock', () => {
  const lock = `select pg_advisory_lock($1) [${MIGRATION_LOCK_KEY}]`;
  const unlock = `select pg_advisory_unlock($1) [${MIGRATION_LOCK_KEY}]`;

  it('migrates on one connection holding the advisory lock, then unlocks and returns it to the pool', async () => {
    const { db, steps, released } = fakeDb();
    await migrateWithLock(db, '/migrations', async (_db, config) => void steps.push(`migrate ${config.migrationsFolder}`));
    expect(steps).toEqual([lock, 'migrate /migrations', unlock]);
    expect(released).toEqual([undefined]);
  });

  it('unlocks and drops the connection when a migration fails', async () => {
    const { db, steps, released } = fakeDb();
    const failing = async () => {
      throw new Error('type "event_inquiries" already exists');
    };
    await expect(migrateWithLock(db, '/migrations', failing)).rejects.toThrow('already exists');
    expect(steps).toEqual([lock, unlock]);
    expect(released).toHaveLength(1);
    expect(released[0]).toBeInstanceOf(Error);
  });
});

/**
 * Concurrent cold starts against a real PostgreSQL server (TEST_DATABASE_URL; the test
 * creates and drops its own database there): without the lock they fail on duplicate objects.
 */
describe.runIf(process.env.TEST_DATABASE_URL)('migrateWithLock on PostgreSQL', () => {
  it('lets several instances boot at once', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'seatiko-migrate-'));
    mkdirSync(join(folder, 'meta'));
    writeFileSync(
      join(folder, '0000_probe.sql'),
      `CREATE TYPE "probe_kind" AS ENUM ('a');--> statement-breakpoint\nSELECT pg_sleep(0.3);--> statement-breakpoint\nCREATE TABLE "probe" ("kind" "probe_kind");`,
    );
    writeFileSync(
      join(folder, 'meta/_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries: [{ idx: 0, version: '7', when: Date.now(), tag: '0000_probe', breakpoints: true }] }),
    );
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const name = `seatiko_migrate_lock_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    const pools = Array.from({ length: 4 }, () => new Pool({ connectionString: url.toString(), max: 2 }));
    try {
      const results = await Promise.allSettled(pools.map((pool) => migrateWithLock(drizzle({ client: pool }) as unknown as Database, folder)));
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      const applied = await pools[0].query('select count(*)::int as n from drizzle.__drizzle_migrations');
      expect(applied.rows[0].n).toBe(1);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });
});
