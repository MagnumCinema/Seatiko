import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

/**
 * Removes demo / test data from a database, keeping reference and open data:
 * cities, open places (OSM + Overture) and their import log, migrations.
 * Partner venues, accounts, bookings, menus, staff and the rest are deleted.
 *   docker compose exec nest-api node dist/cli/clear-demo-data.js --yes
 */
async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This deletes all accounts, venues, bookings and orders. Run again with --yes.');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = drizzle({ connection: url });
  try {
    // Not TRUNCATE … CASCADE on venues: it would also empty open_places.
    await db.execute(sql`UPDATE open_places SET venue_id = NULL`);
    await db.execute(sql`
      TRUNCATE reservation_tables, reservations, table_watches, waitlist_entries, event_inquiries,
        order_items, orders, waiter_calls, sessions, notifications, adult_permission_log,
        work_shifts, staff_members, profile_change_requests, application_activities, applications,
        menu_items, tables, collections, user_identities, users, app_meta`);
    await db.execute(sql`DELETE FROM venues`);
    console.log('demo data removed; cities and open places kept');
  } finally {
    await db.$client.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
