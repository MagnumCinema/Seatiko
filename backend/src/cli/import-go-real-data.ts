import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema/index.js';
import { importGoState } from '../database/seed/import-go-state.js';
import { values, type GoState } from '../database/seed/go-state.js';

/**
 * Cutover: moves the real data of a Go snapshot into the Nest database and leaves
 * the demo out (demo ids, @seatiko.local and contract-test accounts). Keeps ids and
 * password hashes, so people sign in as before. Adds to existing rows.
 *   node dist/cli/import-go-real-data.js /path/seatiko-state.json [--dry-run]
 */
const file = process.argv[2];
if (!file) throw new Error('usage: import-go-real-data.js <seatiko-state.json> [--dry-run]');
const state = JSON.parse(readFileSync(file, 'utf8')) as GoState & Record<string, unknown>;

const demoUser = (id: string, email: string) =>
  id.startsWith('user-demo') || id === 'user-guest-demo' || id === 'user-guest-calendar' || /@(seatiko\.local|contract\.test)$/i.test(email);
const users = Object.fromEntries(values(state.users).filter((u: any) => !demoUser(u.id, u.email ?? '')).map((u: any) => [u.id, u]));
const realUser = (id: string) => id in users;
const applications = Object.fromEntries(
  values(state.applications)
    .filter((a: any) => !a.id.startsWith('app-demo') && realUser(a.owner_user_id))
    .map((a: any) => [a.id, { ...a, venue_id: null }]), // venues of the Go demo do not exist here
);
const appIds = new Set(Object.keys(applications));
const activities = Object.fromEntries(Object.entries((state.activities ?? {}) as Record<string, unknown>).filter(([id]) => appIds.has(id)));
const profileChanges = Object.fromEntries(values(state.profile_changes).filter((c: any) => appIds.has(c.application_id)).map((c: any) => [c.id, c]));

const real = { users, applications, activities, profile_changes: profileChanges } as unknown as GoState;
console.log(`real data: ${Object.keys(users).length} accounts, ${appIds.size} applications, ${Object.keys(profileChanges).length} change requests`);
if (process.argv.includes('--dry-run')) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const db = drizzle({ connection: url, schema, casing: 'snake_case' });
try {
  console.log('imported:', await importGoState(db, real, { replace: false }));
} finally {
  await db.$client.end();
}
