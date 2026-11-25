// Venue types and team roles of the demo venues, so the demo owner
// (owner@seatiko.local: La Plăcinte, Oliva, Sakura) can try the roles system.
import { initialRoles, isPresetKey } from '../../modules/venue-roles/domain/role-presets.js';
import type { venueRoles } from '../schema/index.js';

export const DEMO_VENUE_TYPES: Record<string, string> = {
  'venue-1': 'restaurant',
  'venue-2': 'cafe',
  'venue-3': 'restaurant',
  'venue-4': 'pizzeria',
  'venue-5': 'pub',
  'venue-6': 'restaurant',
  'venue-7': 'fast_food',
  'venue-8': 'bar',
  'venue-9': 'wine_bar',
  'venue-10': 'pizzeria',
  'venue-11': 'restaurant',
  'venue-12': 'restaurant',
  'venue-13': 'bakery',
  'venue-14': 'restaurant',
};

/** Owner-made roles of the demo venues (name as the owner typed it). */
const DEMO_CUSTOM_ROLES: Record<string, Array<{ key: string; name: string; color: string; inSchedule: boolean }>> = {
  'venue-1': [{ key: 'custom-banquet', name: 'Банкет-менеджер', color: '#0ea5e9', inSchedule: false }],
  'venue-11': [{ key: 'custom-sushi', name: 'Сушист', color: '#ef4444', inSchedule: true }],
};

/** Demo team members moved from waiter/cook to the roles of their venue's type. */
export const DEMO_STAFF_ROLES: Record<string, string> = {
  'staff-member-demo-14': 'host',
  'staff-member-demo-15': 'manager',
  'staff-member-demo-12': 'custom-banquet',
  'staff-v11-1': 'custom-sushi',
  'staff-v11-5': 'custom-sushi',
  'staff-v4-6': 'pizzaiolo',
  'staff-v4-7': 'pizzaiolo',
  'staff-v4-5': 'runner',
  'staff-v4-4': 'cashier',
};

/** Rows for venue_roles: each venue's preset, roles its team uses, and the demo custom roles. */
export function demoVenueRoles(venues: Array<{ id: string; type: string }>, usedKeys: Map<string, Set<string>>, at: string): Array<typeof venueRoles.$inferInsert> {
  const rows: Array<typeof venueRoles.$inferInsert> = [];
  for (const v of venues) {
    const custom = DEMO_CUSTOM_ROLES[v.id] ?? [];
    const customKeys = new Set(custom.map((c) => c.key));
    const used = [...(usedKeys.get(v.id) ?? [])].filter((k) => !customKeys.has(k));
    const seeds = initialRoles(v.type, used);
    seeds.forEach((s, i) =>
      rows.push({ id: `role-${v.id}-${s.key}`, venueId: v.id, key: s.key, name: isPresetKey(s.key) ? '' : s.key, color: s.color, inSchedule: s.inSchedule, position: i, isSystem: isPresetKey(s.key), permissions: s.permissions, createdAt: at }),
    );
    custom.forEach((c, i) =>
      rows.push({ id: `role-${v.id}-${c.key}`, venueId: v.id, key: c.key, name: c.name, color: c.color, inSchedule: c.inSchedule, position: seeds.length + i, isSystem: false, permissions: [], createdAt: at }),
    );
  }
  return rows;
}
