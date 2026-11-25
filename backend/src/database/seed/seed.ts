import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../schema/index.js';
import { importGoState } from './import-go-state.js';

/**
 * Seeds or imports data.
 *   node dist/database/seed/seed.js                 → demo data (fresh Go state, moved to today)
 *   node dist/database/seed/seed.js --force         → allow seeding main dev database (non-production)
 *   node dist/database/seed/seed.js --file state.json → import a Go snapshot as is (cutover)
 * Always replaces existing Seatiko rows.
 */
async function main() {
  const fileArg = process.argv.indexOf('--file');
  const force = process.argv.includes('--force');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (give the test database explicitly)');
  // Demo data is for development and contract tests only: never into production.
  if (process.env.APP_ENV === 'production' || (!force && /\/seatiko(\?|$)/.test(url))) {
    throw new Error('refusing to seed demo data into the main database without --force; use a test database (e.g. …/seatiko_test)');
  }
  const db = drizzle({ connection: url, schema, casing: 'snake_case' });
  try {
    if (fileArg > 0) {
      const state = JSON.parse(readFileSync(process.argv[fileArg + 1], 'utf8'));
      console.log('imported Go snapshot:', await importGoState(db, state, { replace: true }));
      return;
    }
    const demo = JSON.parse(readFileSync(join(import.meta.dirname, 'demo-state.json'), 'utf8')) as { generated_at: string; state: unknown };
    const shiftMs = Date.now() - new Date(demo.generated_at).getTime();
    console.log('demo seed:', await importGoState(db, demo.state as never, { replace: true, shiftMs }));
  } finally {
    await db.$client.end();
  }
}

await main();
