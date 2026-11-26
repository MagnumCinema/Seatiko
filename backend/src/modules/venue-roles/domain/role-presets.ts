// Venue formats and the team roles suggested for each of them.
// Type ids match RestaurantTypeId in the web app (lib/discover-preferences.ts).

export const VENUE_TYPES = ['restaurant', 'cafe', 'bar', 'fast_food', 'fine_dining', 'pub', 'pizzeria', 'bakery', 'wine_bar'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const isVenueType = (v: string): v is VenueType => (VENUE_TYPES as readonly string[]).includes(v);

/**
 * Capabilities a role may get in phase 2 (venue-scoped access). Stored with the
 * role now, not enforced and not shown yet.
 */
export const ROLE_PERMISSIONS = [
  'floor.orders',
  'floor.calls',
  'floor.tables',
  'floor.waitlist',
  'guests.verify_18',
  'venue.menu_stop',
  'venue.menu_edit',
  'venue.floor_edit',
  'venue.rules_edit',
  'venue.reservations',
  'venue.shifts_manage',
  'venue.staff_manage',
  'venue.roles_manage',
  'venue.profile_edit',
  'venue.analytics',
] as const;

export type RoleSeed = { key: string; color: string; inSchedule: boolean; permissions: string[] };

const FLOOR = ['floor.orders', 'floor.calls', 'floor.tables'];
const LEAD = [...FLOOR, 'floor.waitlist', 'guests.verify_18', 'venue.menu_stop', 'venue.reservations', 'venue.shifts_manage'];
const MANAGER = [...LEAD, 'venue.menu_edit', 'venue.floor_edit', 'venue.rules_edit', 'venue.staff_manage', 'venue.roles_manage', 'venue.profile_edit', 'venue.analytics'];

/** Every preset role: badge colour, whether it appears in the shift planner, default capabilities. */
export const PRESET_ROLES: Record<string, Omit<RoleSeed, 'key'>> = {
  waiter: { color: '#3b82f6', inSchedule: true, permissions: [...FLOOR, 'floor.waitlist'] },
  cook: { color: '#f59e0b', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop'] },
  chef: { color: '#ea580c', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop', 'venue.menu_edit'] },
  host: { color: '#ec4899', inSchedule: true, permissions: ['floor.tables', 'floor.waitlist', 'venue.reservations'] },
  manager: { color: '#8b5cf6', inSchedule: true, permissions: MANAGER },
  barista: { color: '#a16207', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop'] },
  pastry_chef: { color: '#f472b6', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop'] },
  cashier: { color: '#14b8a6', inSchedule: true, permissions: ['floor.orders'] },
  shift_lead: { color: '#6366f1', inSchedule: true, permissions: LEAD },
  sommelier: { color: '#9f1239', inSchedule: true, permissions: ['floor.orders', 'guests.verify_18', 'venue.menu_stop'] },
  bartender: { color: '#0ea5e9', inSchedule: true, permissions: ['floor.orders', 'guests.verify_18', 'venue.menu_stop'] },
  head_bartender: { color: '#0369a1', inSchedule: true, permissions: [...LEAD] },
  runner: { color: '#22c55e', inSchedule: true, permissions: ['floor.orders', 'floor.calls'] },
  pizzaiolo: { color: '#dc2626', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop'] },
  baker: { color: '#d97706', inSchedule: true, permissions: ['floor.orders', 'venue.menu_stop'] },
};

/** Preset role keys per venue type, in display order. */
export const TYPE_PRESETS: Record<VenueType, string[]> = {
  restaurant: ['waiter', 'cook', 'host', 'manager'],
  cafe: ['barista', 'pastry_chef', 'cashier', 'shift_lead'],
  fine_dining: ['waiter', 'chef', 'cook', 'host', 'sommelier', 'manager'],
  bar: ['bartender', 'waiter', 'host', 'head_bartender'],
  pub: ['bartender', 'waiter', 'host', 'head_bartender'],
  wine_bar: ['sommelier', 'bartender', 'waiter', 'manager'],
  pizzeria: ['pizzaiolo', 'cashier', 'runner', 'shift_lead'],
  bakery: ['baker', 'cashier', 'runner', 'shift_lead'],
  fast_food: ['cook', 'cashier', 'runner', 'shift_lead'],
};

/** Roles of a venue whose type is not chosen yet (the two the cabinet always had). */
export const FALLBACK_PRESET = ['waiter', 'cook'];

/** Colours offered for custom roles, also used when none is given. */
export const ROLE_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#0ea5e9', '#a16207', '#64748b'];

export const MAX_ROLES = 30;
export const MAX_ROLE_NAME = 40;

export const isPresetKey = (key: string) => Object.hasOwn(PRESET_ROLES, key);

export function presetSeed(key: string): RoleSeed | undefined {
  const p = PRESET_ROLES[key];
  return p ? { key, color: p.color, inSchedule: p.inSchedule, permissions: [...p.permissions] } : undefined;
}

/** Preset keys suggested for a venue type ('' or unknown → waiter and cook). */
export function presetKeys(type: string): string[] {
  return isVenueType(type) ? TYPE_PRESETS[type] : FALLBACK_PRESET;
}

/** Preset roles of a type that the venue does not have yet, in preset order. */
export function missingPresetRoles(type: string, existingKeys: Iterable<string>): RoleSeed[] {
  const have = new Set(existingKeys);
  return presetKeys(type)
    .filter((k) => !have.has(k))
    .map((k) => presetSeed(k)!)
    .filter(Boolean);
}

/**
 * Starting roles of a venue: the preset of its type plus every role key the team
 * already uses (old waiter/cook members), so nobody is left without a role.
 */
export function initialRoles(type: string, usedKeys: Iterable<string>): RoleSeed[] {
  const seeds = missingPresetRoles(type, []);
  const have = new Set(seeds.map((s) => s.key));
  let i = 0;
  for (const raw of usedKeys) {
    const key = raw.trim();
    if (!key || have.has(key)) continue;
    have.add(key);
    seeds.push(presetSeed(key) ?? { key, color: ROLE_COLORS[i++ % ROLE_COLORS.length], inSchedule: true, permissions: [] });
  }
  return seeds;
}

/** Trimmed role name, or undefined when empty or too long. */
export function cleanRoleName(name: string): string | undefined {
  const n = name.trim().replace(/\s+/g, ' ');
  return n && n.length <= MAX_ROLE_NAME ? n : undefined;
}

export const validColor = (c: string) => /^#[0-9a-f]{6}$/i.test(c.trim());

/** Keeps known capabilities only, without duplicates. */
export function cleanPermissions(list: string[]): string[] {
  return [...new Set(list.map((p) => p.trim()))].filter((p) => (ROLE_PERMISSIONS as readonly string[]).includes(p));
}

/**
 * Why a role cannot be deleted: system roles never; roles still held by staff
 * only with another role to move them to.
 */
export function deleteBlocker(role: { isSystem: boolean; key: string }, membersWithRole: number, reassignTo?: string): 'system_role' | 'role_in_use' | 'bad_reassign' | undefined {
  if (role.isSystem) return 'system_role';
  if (reassignTo !== undefined && reassignTo === role.key) return 'bad_reassign';
  if (membersWithRole > 0 && !reassignTo) return 'role_in_use';
  return undefined;
}

/** Key of a new custom role. */
export const customRoleKey = (id: string) => `custom-${id.replace(/-/g, '').slice(0, 12)}`;
